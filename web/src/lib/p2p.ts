import { isGoodUser, splitRoomAndUser } from './room'
import toast from 'react-hot-toast'
import fileDownload from 'js-file-download'
import { concat } from 'uint8arrays/concat'
import { fromString, toString } from 'uint8arrays'
import { getRoomPresenceURL, getSignalWebSocketURL } from './client'

const FRAME_JSON = 0
const FRAME_BIN = 1
const FILE_CHUNK = 256 * 1024

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

/** P2P wire messages (discriminated by `type`). */
export type WireData =
  | { type: 'text'; name: string; payload: string }
  | {
      type: 'file-offer'
      transferId: string
      name: string
      size: number
    }
  | {
      type: 'file-offer-response'
      transferId: string
      accepted: boolean
    }
  | {
      type: 'file-binary'
      transferId: string
      name: string
      size: number
      mime: string
    }

export type Options = {
  room: string
  user: string
}

export interface P2PError {
  type: string
  err: string | Error
}

type SignalPayload =
  | { t: 'offer'; sdp: RTCSessionDescriptionInit }
  | { t: 'answer'; sdp: RTCSessionDescriptionInit }
  | { t: 'ice'; c: RTCIceCandidateInit }

async function channelSendAll(ch: RTCDataChannel, data: Uint8Array): Promise<void> {
  const MAX = 16 * 1024
  let offset = 0
  while (offset < data.length) {
    if (ch.readyState !== 'open') {
      throw new Error('data channel closed')
    }
    const slice = data.subarray(offset, offset + MAX)
    while (ch.bufferedAmount > 8 * 1024 * 1024) {
      await new Promise<void>((resolve) => {
        ch.addEventListener('bufferedamountlow', () => resolve(), { once: true })
      })
    }
    ch.send(new Uint8Array(slice))
    offset += slice.length
  }
}

async function writeDcFrame(
  ch: RTCDataChannel,
  frameType: number,
  payload: Uint8Array
): Promise<void> {
  const header = new Uint8Array(5)
  header[0] = frameType
  new DataView(header.buffer).setUint32(1, payload.byteLength, false)
  await channelSendAll(ch, header)
  await channelSendAll(ch, payload)
}

class DataChannelReader {
  private buf = new Uint8Array(0)
  private queue: Uint8Array[] = []
  private wait: (() => void) | null = null
  private ended = false

  constructor(ch: RTCDataChannel) {
    ch.binaryType = 'arraybuffer'
    ch.onmessage = (ev) => {
      const u8 = new Uint8Array(ev.data as ArrayBuffer)
      this.queue.push(u8)
      if (this.wait) {
        this.wait()
        this.wait = null
      }
    }
    ch.onclose = () => {
      this.ended = true
      if (this.wait) {
        this.wait()
        this.wait = null
      }
    }
  }

  async read(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) {
      if (this.queue.length > 0) {
        const next = this.queue.shift()!
        const merged =
          this.buf.length === 0 ? next : concat([this.buf, next])
        this.buf = new Uint8Array(merged)
      } else {
        if (this.ended) {
          throw new Error('stream ended')
        }
        await new Promise<void>((r) => {
          this.wait = r
        })
      }
    }
    const out = this.buf.subarray(0, n)
    this.buf = this.buf.subarray(n)
    return out
  }

  cancel() {
    this.ended = true
    if (this.wait) {
      this.wait()
      this.wait = null
    }
  }
}

async function readDcFrame(reader: DataChannelReader): Promise<{
  frameType: number
  payload: Uint8Array
}> {
  const h = await reader.read(5)
  const frameType = h[0]
  const len = new DataView(h.buffer, h.byteOffset + 1, 4).getUint32(0, false)
  const payload = await reader.read(len)
  return { frameType, payload }
}

export class P2P {
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
      const url = getSignalWebSocketURL(options.room, logicalId)
      const ws = new WebSocket(url)
      instance.ws = ws
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error('WebRTC signaling connection failed'))
      })
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

    const iceEarly: RTCIceCandidateInit[] = []
    let remoteReady = false

    const addIce = async (c: RTCIceCandidateInit) => {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c))
      } catch (e) {
        console.warn('addIceCandidate (inbound):', e)
      }
    }

    this.registerInHandler(from, (p) => {
      if (p.t === 'ice') {
        if (remoteReady) {
          void addIce(p.c)
        } else {
          iceEarly.push(p.c)
        }
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
      remoteReady = true
      for (const c of iceEarly) {
        await addIce(c)
      }
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
      const hello = JSON.parse(toString(payload)) as {
        type?: string
        logicalId?: string
      }
      if (hello.type !== 'hello' || !hello.logicalId) {
        throw new Error('invalid hello')
      }
      remoteLogical = hello.logicalId
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
    try {
      const res = await fetch(getRoomPresenceURL(this.room), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logicalId: this.id, addrs: [] }),
      })
      if (!res.ok) {
        console.warn('presence POST failed:', res.status)
      }
    } catch (e) {
      console.warn('presence POST error:', e)
    }
  }

  close() {
    console.log('P2P closing:', this.id)
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
    if (isGoodUser(user)) {
      return this.room + '-' + user
    }
    const maybe = user.toLowerCase().replace(' ', '-')
    if (isGoodUser(maybe)) {
      return this.room + '-' + maybe
    }
    return user
  }

  isSelf(id: string) {
    return this.getConnectID(id) === this.id
  }

  connect(fullName: string, _addrs: string[], callback: ConnectionCallback) {
    const logicalId = this.getConnectID(fullName)
    console.log('connect (WebRTC):', this.id, '->', logicalId)
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

export type FileOfferMeta = {
  transferId: string
  name: string
  size: number
}

export type ConnectionCallback = {
  knock?: (conn: Connection) => void
  open: (conn: Connection) => void
  close: (conn: Connection) => void
  error: (conn: Connection, err: Error) => void
  fileOffer?: (
    conn: Connection,
    meta: FileOfferMeta,
    respond: (accepted: boolean) => void
  ) => void
}

export interface LazyConnection {
  getReal: (peer: P2P) => Connection
  id: string
}

export class LazyConnectionImpl implements LazyConnection {
  id: string
  buildConn: (peer: P2P) => Connection
  conn?: Connection

  constructor(id: string, buildConn: (peer: P2P) => Connection) {
    this.id = id
    this.buildConn = buildConn
  }

  getReal(peer: P2P) {
    if (this.conn) {
      return this.conn
    }
    this.conn = this.buildConn(peer)
    return this.conn
  }
}

export class Connection implements LazyConnection {
  id: string
  err?: Error
  closed?: boolean
  opened?: boolean
  private channel: RTCDataChannel | null
  private reader: DataChannelReader | null
  private pc: RTCPeerConnection | null
  private readonly p2p: P2P
  private readonly callback: ConnectionCallback
  /** Signaling peer id (inbound only); used to unregister ICE handler. */
  private readonly signalPeerId: string | null
  private pendingOfferResponses = new Map<
    string,
    {
      resolve: (accepted: boolean) => void
      promiseReject: (err: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private fileSink: {
    transferId: string
    name: string
    size: number
    mime: string
    received: Uint8Array[]
    total: number
  } | null = null
  private finallyCb?: () => void

  get ok() {
    return !this.err && !this.closed
  }

  getReal() {
    return this
  }

  get user() {
    const [, user] = splitRoomAndUser(this.id)
    if (user) {
      return user
    }
    return this.id
  }

  onFinally(cb: () => void) {
    this.finallyCb = cb
  }

  constructor(
    id: string,
    channel: RTCDataChannel | null,
    reader: DataChannelReader | null,
    pc: RTCPeerConnection | null,
    p2p: P2P,
    callback: ConnectionCallback,
    direction: 'inbound' | 'outbound',
    signalPeerId?: string
  ) {
    this.id = id
    this.channel = channel
    this.reader = reader
    this.pc = pc
    this.p2p = p2p
    this.callback = callback
    this.signalPeerId =
      direction === 'inbound' ? (signalPeerId ?? id) : null
    if (direction === 'outbound') {
      void this.openOutbound()
    }
  }

  private async openOutbound(): Promise<void> {
    const remoteId = this.id
    const iceEarly: RTCIceCandidateInit[] = []
    let remoteDesc = false

    const pc = new RTCPeerConnection(rtcConfig)
    this.pc = pc
    this.p2p.trackPc(pc)

    const flushIce = async () => {
      if (!remoteDesc) {
        return
      }
      for (const c of iceEarly) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c))
        } catch (e) {
          console.warn('addIceCandidate (outbound):', e)
        }
      }
      iceEarly.length = 0
    }

    this.p2p.registerOutHandler(remoteId, (p: SignalPayload) => {
      void (async () => {
        if (p.t === 'answer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(p.sdp))
            remoteDesc = true
            await flushIce()
          } catch (e) {
            console.warn('setRemoteDescription answer:', e)
          }
        }
        if (p.t === 'ice') {
          if (!remoteDesc) {
            iceEarly.push(p.c)
          } else {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(p.c))
            } catch (e) {
              console.warn('addIceCandidate:', e)
            }
          }
        }
      })()
    })

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.p2p.sendSignal(remoteId, { t: 'ice', c: ev.candidate.toJSON() })
      }
    }

    try {
      const dc = pc.createDataChannel('webdrop', { ordered: true })
      dc.binaryType = 'arraybuffer'
      const reader = new DataChannelReader(dc)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.p2p.sendSignal(remoteId, { t: 'offer', sdp: pc.localDescription! })

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error('DataChannel open timeout')),
          60_000
        )
        dc.onopen = () => {
          clearTimeout(t)
          resolve()
        }
        dc.onerror = () => {
          clearTimeout(t)
          reject(new Error('DataChannel error'))
        }
      })

      await writeDcFrame(
        dc,
        FRAME_JSON,
        fromString(JSON.stringify({ type: 'hello', logicalId: this.p2p.id }))
      )
      const { frameType, payload } = await readDcFrame(reader)
      if (frameType !== FRAME_JSON) {
        throw new Error('expected hello reply')
      }
      const hello = JSON.parse(toString(payload)) as {
        type?: string
        logicalId?: string
      }
      if (hello.type !== 'hello' || hello.logicalId !== remoteId) {
        throw new Error('peer hello mismatch')
      }

      this.channel = dc
      this.reader = reader
      this.opened = true
      this.callback.open(this)
      this.runReadLoop()
    } catch (e) {
      this.p2p.unregisterOutHandler(remoteId)
      const err = e instanceof Error ? e : new Error(String(e))
      this.err = err
      this.closed = true
      pc.close()
      this.callback.error(this, err)
    }
  }

  runReadLoop(): void {
    void this.runReadLoopInner()
  }

  private async runReadLoopInner(): Promise<void> {
    const reader = this.reader
    if (!reader) {
      return
    }
    try {
      while (true) {
        const { frameType, payload } = await readDcFrame(reader)
        if (frameType === FRAME_JSON) {
          await this.handleJsonPayload(payload)
        } else {
          this.handleBinaryPayload(payload)
        }
      }
    } catch {
      if (!this.closed) {
        this.closed = true
        this.opened = false
        this.callback.close(this)
      }
    } finally {
      this.finallyCb?.()
    }
  }

  private async handleJsonPayload(payload: Uint8Array): Promise<void> {
    const data = JSON.parse(toString(payload)) as WireData & {
      type: string
      logicalId?: string
    }
    console.log(
      'receive:',
      this.id,
      data.type,
      'name' in data ? data.name : ''
    )
    if (data.type === 'text') {
      toast(`receive message from ${data.name}: ${data.payload}`)
      return
    }
    if (data.type === 'file-offer-response') {
      const pending = this.pendingOfferResponses.get(data.transferId)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingOfferResponses.delete(data.transferId)
        pending.resolve(data.accepted)
      }
      return
    }
    if (data.type === 'file-offer') {
      const meta: FileOfferMeta = {
        transferId: data.transferId,
        name: data.name,
        size: data.size,
      }
      const respond = (accepted: boolean) => {
        void this.sendJson({
          type: 'file-offer-response',
          transferId: data.transferId,
          accepted,
        })
      }
      this.callback.fileOffer?.(this, meta, respond)
      return
    }
    if (data.type === 'file-binary') {
      this.fileSink = {
        transferId: data.transferId,
        name: data.name,
        size: data.size,
        mime: data.mime,
        received: [],
        total: 0,
      }
      return
    }
  }

  private handleBinaryPayload(chunk: Uint8Array): void {
    const sink = this.fileSink
    if (!sink) {
      return
    }
    sink.received.push(chunk)
    sink.total += chunk.byteLength
    if (sink.total >= sink.size) {
      const blob = new Blob(sink.received as BlobPart[], { type: sink.mime })
      toast(`receive file ${sink.name}`, { icon: '📁' })
      fileDownload(blob, sink.name)
      this.fileSink = null
    }
  }

  private clearPendingOffers(err: Error) {
    for (const [tid, p] of [...this.pendingOfferResponses.entries()]) {
      clearTimeout(p.timer)
      this.pendingOfferResponses.delete(tid)
      p.promiseReject(err)
    }
  }

  private chOpen(): boolean {
    return this.channel !== null && this.channel.readyState === 'open'
  }

  private async sendJson(obj: unknown): Promise<void> {
    const ch = this.channel
    if (!ch || !this.chOpen()) {
      toast.error(`connection to ${this.id} is not open`)
      return
    }
    await writeDcFrame(ch, FRAME_JSON, fromString(JSON.stringify(obj)))
  }

  async sendFileWithConsent(file: File, timeoutMs = 300_000): Promise<void> {
    if (!this.chOpen()) {
      toast.error(`connection to ${this.id} is not open`)
      throw new Error('connection not open')
    }
    const ch = this.channel!
    const transferId = crypto.randomUUID()
    const accepted = await new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        const p = this.pendingOfferResponses.get(transferId)
        if (p) {
          clearTimeout(p.timer)
          this.pendingOfferResponses.delete(transferId)
          p.promiseReject(new Error('Timed out waiting for receiver'))
        }
      }, timeoutMs)
      this.pendingOfferResponses.set(transferId, {
        resolve,
        promiseReject: reject,
        timer,
      })
      void this.sendJson({
        type: 'file-offer',
        transferId,
        name: file.name,
        size: file.size,
      })
    })
    if (!accepted) {
      throw new Error('Receiver declined the transfer')
    }
    await this.sendJson({
      type: 'file-binary',
      transferId,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
    })
    const ab = await file.arrayBuffer()
    const u8 = new Uint8Array(ab)
    for (let i = 0; i < u8.length; i += FILE_CHUNK) {
      const slice = u8.subarray(i, i + FILE_CHUNK)
      await writeDcFrame(ch, FRAME_BIN, slice)
    }
  }

  send(data: WireData) {
    if (!this.chOpen()) {
      toast.error(`connection to ${this.id} is not open`)
      console.log('send to closed:', this.id)
      return
    }
    console.log('send:', this.id, data.type)
    void this.sendJson(data)
  }

  close() {
    if (this.closed) {
      return
    }
    this.clearPendingOffers(new Error('Connection closed'))
    if (this.signalPeerId !== null) {
      this.p2p.unregisterInHandler(this.signalPeerId)
    } else {
      this.p2p.unregisterOutHandler(this.id)
    }
    this.reader?.cancel()
    this.reader = null
    try {
      this.channel?.close()
    } catch {
      /* ignore */
    }
    this.channel = null
    try {
      this.pc?.close()
    } catch {
      /* ignore */
    }
    this.pc = null
    this.closed = true
    this.opened = false
    this.callback.close(this)
  }
}
