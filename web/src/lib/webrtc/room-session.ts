import { splitRoomAndUser } from '../room'
import { connectSignalingWebSocket, postRoomPresence } from '../api'
import { resolvePeerId } from './connect-id'
import { waitForSignalingWebSocket } from './signaling-ws'
import { PeerLink, type PeerLinkCallback } from './peer-link'
import type { SessionRuntime } from './session-runtime'
import type { SignalBody } from './types'
import type { SessionOptions } from './types'

export class RoomSession implements SessionRuntime {
  id: string
  err?: Error
  closed?: boolean
  private presenceTimer?: ReturnType<typeof setInterval>
  private readonly inboundByPeer = new Map<string, PeerLink>()
  private readonly signalHandlers = new Map<string, (body: SignalBody) => void>()
  private readonly pcs = new Set<RTCPeerConnection>()
  private ws: WebSocket | null = null
  private onOpenCb?: (id: string) => void
  inboundCallback?: PeerLinkCallback
  private opened = false

  get ok() {
    return !this.err && !this.closed
  }

  get room() {
    const [room] = splitRoomAndUser(this.id)
    return room || ''
  }

  get user() {
    const [, user] = splitRoomAndUser(this.id)
    return user || this.id
  }

  private constructor(peerId: string) {
    this.id = peerId
  }

  static async create(
    options: SessionOptions,
    inboundCallback?: PeerLinkCallback
  ): Promise<RoomSession> {
    const peerId = `${options.room}-${options.user}`
    const instance = new RoomSession(peerId)
    instance.inboundCallback = inboundCallback
    try {
      const ws = connectSignalingWebSocket(options.room, peerId)
      instance.ws = ws
      await waitForSignalingWebSocket(ws)
      ws.onmessage = (ev) => {
        let parsed: { v?: unknown; from?: unknown; body?: unknown }
        try {
          parsed = JSON.parse(ev.data as string) as {
            v?: unknown
            from?: unknown
            body?: unknown
          }
        } catch {
          return
        }
        if (parsed.v !== 2 || typeof parsed.from !== 'string') {
          return
        }
        if (parsed.body === null || typeof parsed.body !== 'object') {
          return
        }
        instance.routeSignal(parsed.from, parsed.body as SignalBody)
      }
      ws.onclose = () => {
        if (!instance.closed) {
          instance.closed = true
        }
      }
      await instance.afterStart()
      return instance
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      instance.err = err
      instance.closed = true
      instance.ws?.close()
      return instance
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    this.ws.send(JSON.stringify({ v: 2, to, body }))
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

  private async afterStart(): Promise<void> {
    try {
      this.startPresence()
      this.opened = true
      this.onOpenCb?.(this.id)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      this.err = err
      this.closed = true
      this.ws?.close()
    }
  }

  private startPresence(): void {
    const post = () => {
      void postRoomPresence(this.room, this.id)
    }
    post()
    this.presenceTimer = setInterval(post, 20_000)
  }

  close(): void {
    this.closed = true
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer)
    }
    for (const c of this.inboundByPeer.values()) {
      c.close()
    }
    this.inboundByPeer.clear()
    this.signalHandlers.clear()
    for (const pc of [...this.pcs]) {
      pc.close()
    }
    this.pcs.clear()
    this.ws?.close()
    this.ws = null
  }

  onOpen(callback: (id: string) => void): void {
    this.onOpenCb = callback
    if (this.opened && !this.err) {
      callback(this.id)
    }
  }

  onDisconnect(callback: () => void): void {
    if (!this.ws) {
      return
    }
    this.ws.addEventListener('close', () => {
      if (!this.closed) {
        this.closed = true
        callback()
      }
    })
  }

  onClose(callback: () => void): void {
    if (!this.ws) {
      return
    }
    this.ws.addEventListener('close', () => {
      callback()
    })
  }

  onConnection(callback: PeerLinkCallback): void {
    this.inboundCallback = callback
  }

  getPeerId(user: string): string {
    return resolvePeerId(this.room, user)
  }

  isSelf(id: string): boolean {
    return this.getPeerId(id) === this.id
  }

  connect(fullName: string, callback: PeerLinkCallback): PeerLink {
    const peerId = this.getPeerId(fullName)
    return new PeerLink(peerId, this, callback)
  }
}
