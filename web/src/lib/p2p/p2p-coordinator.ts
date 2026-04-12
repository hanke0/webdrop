import { splitRoomAndUser } from '../room'
import { fromString } from 'uint8arrays'
import { connectSignalingWebSocket, postRoomPresence } from '../api'
import { FRAME_JSON, rtcConfig } from './constants'
import { Connection, type ConnectionCallback } from './connection'
import { DataChannelReader, readDcFrame, writeDcFrame } from './data-channel'
import { parseHelloJsonPayload } from './hello'
import { IceCandidatePipeline } from './ice-pipeline'
import { resolveOutboundLogicalId } from './connect-id'
import type { SignalPayload } from './types'
import { waitForSignalingWebSocket } from './signaling-ws'
import type { P2PRuntime } from './p2p-runtime'
import type { Options } from './types'

export class P2P implements P2PRuntime {
  id: string
  err?: Error
  closed?: boolean
  private presenceTimer?: ReturnType<typeof setInterval>
  private readonly inboundByLogical = new Map<string, Connection>()
  private readonly outSignalHandlers = new Map<
    string,
    (p: SignalPayload) => void
  >()
  private readonly inSignalHandlers = new Map<
    string,
    (p: SignalPayload) => void
  >()
  private readonly pcs = new Set<RTCPeerConnection>()
  private ws: WebSocket | null = null
  private onOpenCb?: (id: string) => void
  inboundCallback?: ConnectionCallback
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

  private constructor(logicalId: string) {
    this.id = logicalId
  }

  static async create(
    options: Options,
    inboundCallback?: ConnectionCallback
  ): Promise<P2P> {
    const logicalId = `${options.room}-${options.user}`
    const instance = new P2P(logicalId)
    instance.inboundCallback = inboundCallback
    try {
      const ws = connectSignalingWebSocket(options.room, logicalId)
      instance.ws = ws
      await waitForSignalingWebSocket(ws)
      ws.onmessage = (ev) => {
        let parsed: { from?: string; payload?: SignalPayload }
        try {
          parsed = JSON.parse(ev.data as string) as {
            from?: string
            payload?: SignalPayload
          }
        } catch {
          return
        }
        if (typeof parsed.from !== 'string' || !parsed.payload) {
          return
        }
        instance.routeSignal(parsed.from, parsed.payload)
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

  private routeSignal(from: string, payload: SignalPayload) {
    const out = this.outSignalHandlers.get(from)
    if (out) {
      out(payload)
      return
    }
    const inn = this.inSignalHandlers.get(from)
    if (inn) {
      inn(payload)
      return
    }
    if (payload.t === 'offer') {
      void this.acceptIncomingOffer(from, payload.sdp)
    }
  }

  sendSignal(to: string, payload: SignalPayload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    this.ws.send(JSON.stringify({ to, payload }))
  }

  registerOutHandler(remoteId: string, fn: (p: SignalPayload) => void) {
    this.outSignalHandlers.set(remoteId, fn)
  }

  unregisterOutHandler(remoteId: string) {
    this.outSignalHandlers.delete(remoteId)
  }

  registerInHandler(remoteId: string, fn: (p: SignalPayload) => void) {
    this.inSignalHandlers.set(remoteId, fn)
  }

  unregisterInHandler(remoteId: string) {
    this.inSignalHandlers.delete(remoteId)
  }

  trackPc(pc: RTCPeerConnection) {
    this.pcs.add(pc)
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.pcs.delete(pc)
      }
    })
  }

  private async acceptIncomingOffer(
    from: string,
    sdp: RTCSessionDescriptionInit
  ) {
    const cb = this.inboundCallback
    if (!cb || this.closed) {
      return
    }

    const prev = this.inboundByLogical.get(from)
    if (prev) {
      prev.close()
    }

    const pc = new RTCPeerConnection(rtcConfig)
    this.trackPc(pc)

    const icePipe = new IceCandidatePipeline(pc, 'inbound')

    this.registerInHandler(from, (p) => {
      if (p.t === 'ice') {
        icePipe.onSignalIce(p.c)
      }
    })

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendSignal(from, { t: 'ice', c: ev.candidate.toJSON() })
      }
    }

    pc.ondatachannel = (ev) => {
      const ch = ev.channel
      void this.finishInboundFromChannel(from, ch, pc, cb)
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      await icePipe.flushEarly()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.sendSignal(from, { t: 'answer', sdp: pc.localDescription! })
    } catch (e) {
      console.warn('incoming offer failed:', e)
      this.unregisterInHandler(from)
      pc.close()
      this.pcs.delete(pc)
    }
  }

  private async finishInboundFromChannel(
    from: string,
    ch: RTCDataChannel,
    pc: RTCPeerConnection,
    callback: ConnectionCallback
  ) {
    const reader = new DataChannelReader(ch)
    let remoteLogical: string
    try {
      const { frameType, payload } = await readDcFrame(reader)
      if (frameType !== FRAME_JSON) {
        throw new Error('expected hello')
      }
      remoteLogical = parseHelloJsonPayload(payload).logicalId
      await writeDcFrame(
        ch,
        FRAME_JSON,
        fromString(JSON.stringify({ type: 'hello', logicalId: this.id }))
      )
    } catch (e) {
      console.warn('inbound handshake failed:', e)
      this.unregisterInHandler(from)
      pc.close()
      return
    }

    const prev = this.inboundByLogical.get(remoteLogical)
    if (prev) {
      prev.close()
    }

    const conn = new Connection(
      remoteLogical,
      ch,
      reader,
      pc,
      this,
      callback,
      'inbound',
      from
    )
    this.inboundByLogical.set(remoteLogical, conn)
    conn.onFinally(() => {
      if (this.inboundByLogical.get(remoteLogical) === conn) {
        this.inboundByLogical.delete(remoteLogical)
      }
    })
    conn.opened = true
    callback.open(conn)
    conn.runReadLoop()
    if (callback.knock) {
      callback.knock(conn)
    }
  }

  private async afterStart() {
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

  private startPresence() {
    const post = () => {
      void this.postPresence()
    }
    post()
    this.presenceTimer = setInterval(post, 20_000)
  }

  private async postPresence(): Promise<void> {
    if (this.closed) {
      return
    }
    await postRoomPresence(this.room, this.id, [])
  }

  close() {
    this.closed = true
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer)
    }
    for (const c of this.inboundByLogical.values()) {
      c.close()
    }
    this.inboundByLogical.clear()
    this.outSignalHandlers.clear()
    this.inSignalHandlers.clear()
    for (const pc of [...this.pcs]) {
      pc.close()
    }
    this.pcs.clear()
    this.ws?.close()
    this.ws = null
  }

  onOpen(callback: (id: string) => void) {
    this.onOpenCb = callback
    if (this.opened && !this.err) {
      callback(this.id)
    }
  }

  onDisconnect(callback: () => void) {
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

  onClose(callback: () => void) {
    if (!this.ws) {
      return
    }
    this.ws.addEventListener('close', () => {
      callback()
    })
  }

  onConnection(callback: ConnectionCallback) {
    this.inboundCallback = callback
  }

  getConnectID(user: string) {
    return resolveOutboundLogicalId(this.room, user)
  }

  isSelf(id: string) {
    return this.getConnectID(id) === this.id
  }

  connect(fullName: string, _addrs: string[], callback: ConnectionCallback) {
    const logicalId = this.getConnectID(fullName)
    return new Connection(
      logicalId,
      null,
      null,
      null,
      this,
      callback,
      'outbound'
    )
  }
}
