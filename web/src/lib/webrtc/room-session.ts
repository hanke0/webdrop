import { resolvePeerId } from './connect-id'
import { SignalLink } from './signaling-ws'
import { PeerLink, type PeerLinkCallback } from './peer-link'
import type { SessionRuntime } from './session-runtime'
import type { SessionOptions, SignalBody } from './types'

export class RoomSession implements SessionRuntime {
  id: string
  err?: Error
  closed?: boolean
  private readonly inboundByPeer = new Map<string, PeerLink>()
  private readonly signalHandlers = new Map<string, (body: SignalBody) => void>()
  private readonly pcs = new Set<RTCPeerConnection>()
  private readonly link: SignalLink
  private readonly _room: string
  private peers: Set<string>
  private peersListeners = new Set<(peers: string[]) => void>()
  private inboundCallback?: PeerLinkCallback
  private onOpenCb?: (id: string) => void
  private onCloseCb?: () => void
  private onDisconnectCb?: () => void
  private opened = false

  get ok() {
    return !this.err && !this.closed
  }

  get room() {
    return this._room
  }

  /** Snapshot of the other peers currently in the room (server-authoritative). */
  get roomPeers(): string[] {
    return [...this.peers]
  }

  private constructor(link: SignalLink) {
    this.id = link.peerId
    this.link = link
    this._room = link.room
    this.peers = new Set(link.initialPeers.filter((p) => p !== link.peerId))
  }

  static async create(
    options: SessionOptions,
    inboundCallback?: PeerLinkCallback
  ): Promise<RoomSession> {
    let link: SignalLink
    try {
      link = await SignalLink.open({
        user: options.user,
        room: options.room ?? null,
      })
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      const sentinel = Object.create(RoomSession.prototype) as RoomSession
      sentinel.err = err
      sentinel.closed = true
      sentinel.id = ''
      return sentinel
    }

    const instance = new RoomSession(link)
    instance.inboundCallback = inboundCallback
    instance.wireLink()
    instance.opened = true
    instance.onOpenCb?.(instance.id)
    return instance
  }

  private wireLink(): void {
    this.link.on('signal', (from, body) => {
      this.routeSignal(from, body)
    })
    this.link.on('peerJoin', (peerId) => {
      if (peerId === this.id) {
        return
      }
      if (!this.peers.has(peerId)) {
        this.peers.add(peerId)
        this.emitPeers()
      }
    })
    this.link.on('peerLeave', (peerId) => {
      if (this.peers.delete(peerId)) {
        this.emitPeers()
      }
      const inbound = this.inboundByPeer.get(peerId)
      if (inbound) {
        inbound.close()
      }
    })
    this.link.on('peers', (list) => {
      this.peers = new Set(list.filter((p) => p !== this.id))
      this.emitPeers()
    })
    this.link.on('close', () => {
      if (this.closed) {
        return
      }
      this.closed = true
      this.onDisconnectCb?.()
      this.onCloseCb?.()
    })
  }

  private emitPeers(): void {
    const snapshot = this.roomPeers
    for (const cb of this.peersListeners) {
      cb(snapshot)
    }
  }

  private routeSignal(from: string, body: SignalBody) {
    const handler = this.signalHandlers.get(from)
    if (handler) {
      handler(body)
      return
    }
    if (body.type === 'offer') {
      void this.acceptIncomingOffer(from, body.sdp)
    }
  }

  sendSignal(to: string, body: SignalBody): void {
    this.link.sendSignal(to, body)
  }

  registerSignalHandler(
    remotePeerId: string,
    fn: (body: SignalBody) => void
  ): void {
    this.signalHandlers.set(remotePeerId, fn)
  }

  unregisterSignalHandler(remotePeerId: string): void {
    this.signalHandlers.delete(remotePeerId)
  }

  trackPc(pc: RTCPeerConnection): void {
    this.pcs.add(pc)
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.pcs.delete(pc)
      }
    })
  }

  private async acceptIncomingOffer(from: string, sdp: RTCSessionDescriptionInit) {
    const cb = this.inboundCallback
    if (!cb || this.closed) {
      return
    }

    const prev = this.inboundByPeer.get(from)
    if (prev) {
      prev.close()
    }

    const conn = await PeerLink.acceptOffer(this, from, sdp, cb)
    if (!conn) {
      return
    }

    const prevDup = this.inboundByPeer.get(from)
    if (prevDup && prevDup !== conn) {
      prevDup.close()
    }

    this.inboundByPeer.set(from, conn)
    conn.onFinally(() => {
      if (this.inboundByPeer.get(from) === conn) {
        this.inboundByPeer.delete(from)
      }
    })
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    for (const c of this.inboundByPeer.values()) {
      c.close()
    }
    this.inboundByPeer.clear()
    this.signalHandlers.clear()
    for (const pc of [...this.pcs]) {
      pc.close()
    }
    this.pcs.clear()
    this.link.close()
  }

  onOpen(callback: (id: string) => void): void {
    this.onOpenCb = callback
    if (this.opened && !this.err) {
      callback(this.id)
    }
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCb = callback
  }

  onClose(callback: () => void): void {
    this.onCloseCb = callback
  }

  onConnection(callback: PeerLinkCallback): void {
    this.inboundCallback = callback
  }

  /** Subscribe to peer-roster changes; returns an unsubscribe. */
  onPeers(callback: (peers: string[]) => void): () => void {
    this.peersListeners.add(callback)
    callback(this.roomPeers)
    return () => {
      this.peersListeners.delete(callback)
    }
  }

  /** Ask the server to re-send the roster (and wait for it via `onPeers`). */
  refreshPeers(): void {
    this.link.requestPeers()
  }

  getPeerId(user: string): string {
    return resolvePeerId(this.room, user)
  }

  isSelf(id: string): boolean {
    return this.getPeerId(id) === this.id
  }

  /** Accepts either a full peer id (`ABC123-adj-noun`) or a bare `adj-noun`. */
  connect(idOrName: string, callback: PeerLinkCallback): PeerLink {
    const peerId = this.getPeerId(idOrName)
    return new PeerLink(peerId, this, callback)
  }
}
