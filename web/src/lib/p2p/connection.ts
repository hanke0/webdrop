import { getUserShowName, splitRoomAndUser } from '../room'
import toast from 'react-hot-toast'
import fileDownload from 'js-file-download'
import { fromString, toString } from 'uint8arrays'
import {
  FILE_CHUNK,
  FRAME_BIN,
  FRAME_JSON,
  rtcConfig,
} from './constants'
import {
  DataChannelReader,
  readDcFrame,
  writeDcFrame,
} from './data-channel'
import { parseHelloJsonPayload } from './hello'
import { IceCandidatePipeline } from './ice-pipeline'
import {
  clearPendingBooleanResponses,
  type PendingBooleanResponse,
} from './pending'
import type { P2PRuntime } from './p2p-runtime'
import type {
  ChatInviteMeta,
  FileOfferMeta,
  SignalPayload,
  WireData,
} from './types'

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
  chatInvite?: (
    conn: Connection,
    meta: ChatInviteMeta,
    respond: (accepted: boolean) => void
  ) => void
  chatMessage?: (
    conn: Connection,
    msg: { name: string; payload: string }
  ) => void
}

export class Connection {
  id: string
  err?: Error
  closed?: boolean
  opened?: boolean
  private channel: RTCDataChannel | null
  private reader: DataChannelReader | null
  private pc: RTCPeerConnection | null
  private readonly p2p: P2PRuntime
  private readonly callback: ConnectionCallback
  /** Signaling peer id (inbound only); used to unregister ICE handler. */
  private readonly signalPeerId: string | null
  private pendingOfferResponses = new Map<string, PendingBooleanResponse>()
  private pendingChatInviteResponses = new Map<string, PendingBooleanResponse>()
  /** Both peers set this after a successful chat-invite handshake. */
  private chatAccepted = false
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

  isChatActive(): boolean {
    return this.chatAccepted
  }

  /** Ask peer to start a text chat; resolves when they accept or decline. */
  async requestChat(timeoutMs = 60_000): Promise<boolean> {
    if (this.chatAccepted) {
      return true
    }
    if (!this.chOpen()) {
      toast.error(`connection to ${this.id} is not open`)
      return false
    }
    const inviteId = crypto.randomUUID()
    try {
      const accepted = await new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => {
          const p = this.pendingChatInviteResponses.get(inviteId)
          if (p) {
            clearTimeout(p.timer)
            this.pendingChatInviteResponses.delete(inviteId)
            p.promiseReject(new Error('Timed out waiting for chat response'))
          }
        }, timeoutMs)
        this.pendingChatInviteResponses.set(inviteId, {
          resolve,
          promiseReject: reject,
          timer,
        })
        void this.sendJson({ type: 'chat-invite', inviteId })
      })
      if (accepted) {
        this.chatAccepted = true
      }
      return accepted
    } catch (e) {
      console.warn('requestChat:', e)
      return false
    }
  }

  sendChatText(body: string): void {
    const t = body.trim()
    if (!t) {
      return
    }
    if (!this.chatAccepted) {
      toast.error('对方尚未接受文字聊天')
      return
    }
    const name = getUserShowName(this.p2p.id)
    this.send({ type: 'text', name, payload: t })
  }

  constructor(
    id: string,
    channel: RTCDataChannel | null,
    reader: DataChannelReader | null,
    pc: RTCPeerConnection | null,
    p2p: P2PRuntime,
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

    const pc = new RTCPeerConnection(rtcConfig)
    this.pc = pc
    this.p2p.trackPc(pc)

    const icePipe = new IceCandidatePipeline(pc, 'outbound')

    this.p2p.registerOutHandler(remoteId, (p: SignalPayload) => {
      void (async () => {
        if (p.t === 'answer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(p.sdp))
            await icePipe.flushEarly()
          } catch (e) {
            console.warn('setRemoteDescription answer:', e)
          }
        } else if (p.t === 'ice') {
          icePipe.onSignalIce(p.c)
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
      const { logicalId } = parseHelloJsonPayload(payload)
      if (logicalId !== remoteId) {
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
    if (data.type === 'text') {
      if (this.chatAccepted) {
        this.callback.chatMessage?.(this, {
          name: data.name,
          payload: data.payload,
        })
      }
      return
    }
    if (data.type === 'chat-invite') {
      const inviteId = data.inviteId
      if (!inviteId) {
        return
      }
      const respond = (accepted: boolean) => {
        void this.sendJson({
          type: 'chat-invite-response',
          inviteId,
          accepted,
        })
        if (accepted) {
          this.chatAccepted = true
        }
      }
      this.callback.chatInvite?.(this, { inviteId }, respond)
      return
    }
    if (data.type === 'chat-invite-response') {
      const pending = this.pendingChatInviteResponses.get(data.inviteId)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingChatInviteResponses.delete(data.inviteId)
        pending.resolve(data.accepted)
      }
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
    clearPendingBooleanResponses(this.pendingOfferResponses, err)
  }

  private clearPendingChatInvites(err: Error) {
    clearPendingBooleanResponses(this.pendingChatInviteResponses, err)
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
      return
    }
    void this.sendJson(data)
  }

  close() {
    if (this.closed) {
      return
    }
    this.clearPendingOffers(new Error('Connection closed'))
    this.clearPendingChatInvites(new Error('Connection closed'))
    this.chatAccepted = false
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
