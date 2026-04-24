import { getUserShowName } from '../room'
import {
  CTRL_LABEL,
  FILE_CHUNK,
  FILE_LABEL,
  PROTOCOL_V,
  rtcConfig,
} from './constants'
import { sendBlobChunks } from './dc-send'
import { IceCandidatePipeline } from './ice-pipeline'
import { attachPcLogging, candidateType, webrtcLog } from './log'
import {
  clearPendingBooleanResponses,
  type PendingBooleanResponse,
} from './pending'
import type { SessionRuntime } from './session-runtime'
import type { CtrlMessage, FileOfferMeta, SignalBody } from './types'

export type PeerLinkCallback = {
  open: (conn: PeerLink) => void
  close: (conn: PeerLink) => void
  error: (conn: PeerLink, err: Error) => void
  fileOffer?: (
    conn: PeerLink,
    meta: FileOfferMeta,
    respond: (accepted: boolean) => void
  ) => void
  /** Called when a file transfer completes successfully. UI should download `blob`. */
  fileReceived?: (conn: PeerLink, name: string, blob: Blob) => void
  /** Called when the sender exceeds the declared file size; connection is closed after. */
  fileOverflow?: (conn: PeerLink) => void
  chatMessage?: (
    conn: PeerLink,
    msg: { name: string; payload: string }
  ) => void
  /** Receiver-side acknowledgement: remote confirmed delivery of `messageId`. */
  chatAck?: (conn: PeerLink, messageId: string) => void
}

function waitForOpen(dc: RTCDataChannel): Promise<void> {
  if (dc.readyState === 'open') {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error('Data channel open timeout')),
      60_000
    )
    dc.onopen = () => {
      clearTimeout(t)
      resolve()
    }
    dc.onerror = () => {
      clearTimeout(t)
      reject(new Error('Data channel error'))
    }
  })
}

function waitForInboundChannels(
  pc: RTCPeerConnection
): Promise<{ ctrl: RTCDataChannel; file: RTCDataChannel }> {
  return new Promise((resolve, reject) => {
    const parts: Partial<{ c: RTCDataChannel; f: RTCDataChannel }> = {}
    const onDc = (ev: RTCDataChannelEvent) => {
      const ch = ev.channel
      if (ch.label === CTRL_LABEL) {
        parts.c = ch
      } else if (ch.label === FILE_LABEL) {
        ch.binaryType = 'arraybuffer'
        parts.f = ch
      }
      if (parts.c && parts.f) {
        clearTimeout(t)
        pc.removeEventListener('datachannel', onDc)
        resolve({ ctrl: parts.c, file: parts.f })
      }
    }
    const t = setTimeout(() => {
      pc.removeEventListener('datachannel', onDc)
      reject(new Error('datachannel timeout'))
    }, 60_000)
    pc.addEventListener('datachannel', onDc)
  })
}

function decodeCtrl(ev: MessageEvent): CtrlMessage | null {
  try {
    const text =
      typeof ev.data === 'string'
        ? ev.data
        : new TextDecoder().decode(ev.data as ArrayBuffer)
    const msg = JSON.parse(text) as CtrlMessage
    if (msg.v !== PROTOCOL_V) {
      return null
    }
    return msg
  } catch {
    return null
  }
}

async function exchangeSessionReady(
  ctrl: RTCDataChannel,
  selfPeerId: string,
  remotePeerId: string
): Promise<void> {
  ctrl.send(
    JSON.stringify({
      v: PROTOCOL_V,
      kind: 'session.ready',
      peerId: selfPeerId,
    })
  )
  await new Promise<void>((resolve, reject) => {
    const onMsg = (ev: MessageEvent) => {
      const msg = decodeCtrl(ev)
      if (
        msg &&
        msg.kind === 'session.ready' &&
        msg.peerId === remotePeerId
      ) {
        clearTimeout(t)
        ctrl.removeEventListener('message', onMsg)
        resolve()
      }
    }
    const t = setTimeout(() => {
      ctrl.removeEventListener('message', onMsg)
      reject(new Error('session.ready timeout'))
    }, 30_000)
    ctrl.addEventListener('message', onMsg)
  })
}

export class PeerLink {
  id: string
  err?: Error
  closed?: boolean
  opened?: boolean
  private ctrl: RTCDataChannel | null = null
  private file: RTCDataChannel | null = null
  private pc: RTCPeerConnection | null = null
  private readonly session: SessionRuntime
  private readonly callback: PeerLinkCallback
  /** Set for inbound: WS routing id (same as remote peer id during offer). */
  private readonly signalPeerId: string | null
  private pendingOffers = new Map<string, PendingBooleanResponse>()
  private fileSink: {
    transferId: string
    name: string
    size: number
    mime: string
    received: Uint8Array[]
    total: number
  } | null = null
  private finallyCb?: () => void
  private readyPromise: Promise<void>
  private readyResolve!: () => void
  private readyReject!: (err: Error) => void
  private readySettled = false

  get ok() {
    return !this.err && !this.closed
  }

  /** Resolves once data channels are open and session.ready has been exchanged. */
  ready(): Promise<void> {
    return this.readyPromise
  }

  onFinally(cb: () => void) {
    this.finallyCb = cb
  }

  constructor(
    remotePeerId: string,
    session: SessionRuntime,
    callback: PeerLinkCallback,
    existing?: {
      pc: RTCPeerConnection
      ctrl: RTCDataChannel
      file: RTCDataChannel
      signalPeerId: string
    }
  ) {
    this.id = remotePeerId
    this.session = session
    this.callback = callback
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    if (existing) {
      this.pc = existing.pc
      this.ctrl = existing.ctrl
      this.file = existing.file
      this.signalPeerId = existing.signalPeerId
      this.bindFileReceive()
      this.bindCtrlApp()
      this.opened = true
      this.settleReady(null)
      this.callback.open(this)
    } else {
      this.signalPeerId = null
      void this.openOutbound()
    }
  }

  private settleReady(err: Error | null): void {
    if (this.readySettled) {
      return
    }
    this.readySettled = true
    if (err) {
      this.readyReject(err)
    } else {
      this.readyResolve()
    }
  }

  static async acceptOffer(
    session: SessionRuntime,
    signalPeerId: string,
    offerSdp: RTCSessionDescriptionInit,
    cb: PeerLinkCallback
  ): Promise<PeerLink | null> {
    const tag = `in ${signalPeerId}`
    const pc = new RTCPeerConnection(rtcConfig)
    let supersededByOffer = false
    session.trackPc(pc)
    attachPcLogging(pc, tag)

    const icePipe = new IceCandidatePipeline(pc, tag)
    const channelsPromise = waitForInboundChannels(pc)

    session.registerSignalHandler(signalPeerId, (body: SignalBody) => {
      void (async () => {
        if (body.type === 'ice') {
          icePipe.onSignalIce(body.candidate)
          return
        }
        if (body.type === 'offer') {
          supersededByOffer = true
          webrtcLog(tag, 'replacement offer received; restarting inbound negotiation')
          session.unregisterSignalHandler(signalPeerId)
          pc.close()
          await session.acceptIncomingOffer(signalPeerId, body.sdp, cb)
        }
      })()
    })

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        webrtcLog(tag, 'local ice (typ)', candidateType(ev.candidate))
        session.sendSignal(signalPeerId, {
          type: 'ice',
          candidate: ev.candidate.toJSON(),
        })
      } else {
        webrtcLog(tag, 'local ice gathering complete')
      }
    }

    try {
      webrtcLog(tag, 'applying remote offer')
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
      await icePipe.flushEarly()

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      webrtcLog(tag, 'answer created; sending')
      session.sendSignal(signalPeerId, {
        type: 'answer',
        sdp: pc.localDescription!,
      })

      /*
       * Chrome/WHATWG: the `datachannel` event on the answerer fires *after*
       * setLocalDescription(answer), so we can only retrieve the channel
       * objects now.
       */
      const { ctrl, file } = await channelsPromise
      webrtcLog(tag, 'inbound data channels received')

      await Promise.all([waitForOpen(ctrl), waitForOpen(file)])
      webrtcLog(tag, 'data channels open')
      await exchangeSessionReady(ctrl, session.id, signalPeerId)
      webrtcLog(tag, 'session.ready exchanged')

      return new PeerLink(signalPeerId, session, cb, {
        pc,
        ctrl,
        file,
        signalPeerId,
      })
    } catch (e) {
      if (!supersededByOffer) {
        console.warn(`[webrtc ${tag}] acceptOffer failed:`, e)
      }
      session.unregisterSignalHandler(signalPeerId)
      pc.close()
      return null
    }
  }

  private async openOutbound(): Promise<void> {
    const remotePeerId = this.id
    const tag = `out ${remotePeerId}`
    let supersededByOffer = false

    const pc = new RTCPeerConnection(rtcConfig)
    this.pc = pc
    this.session.trackPc(pc)
    attachPcLogging(pc, tag)

    const dcCtrl = pc.createDataChannel(CTRL_LABEL, { ordered: true })
    const dcFile = pc.createDataChannel(FILE_LABEL, { ordered: true })
    dcFile.binaryType = 'arraybuffer'
    this.ctrl = dcCtrl
    this.file = dcFile

    const icePipe = new IceCandidatePipeline(pc, tag)

    this.session.registerSignalHandler(remotePeerId, (body: SignalBody) => {
      void (async () => {
        if (body.type === 'answer') {
          try {
            webrtcLog(tag, 'answer received; applying')
            await pc.setRemoteDescription(new RTCSessionDescription(body.sdp))
            await icePipe.flushEarly()
          } catch (e) {
            console.warn(`[webrtc ${tag}] setRemoteDescription answer:`, e)
          }
        } else if (body.type === 'ice') {
          icePipe.onSignalIce(body.candidate)
        } else if (body.type === 'offer') {
          supersededByOffer = true
          webrtcLog(tag, 'offer received while dialing; switching to inbound negotiation')
          this.close()
          await this.session.acceptIncomingOffer(remotePeerId, body.sdp, this.callback)
        }
      })()
    })

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        webrtcLog(tag, 'local ice (typ)', candidateType(ev.candidate))
        this.session.sendSignal(remotePeerId, {
          type: 'ice',
          candidate: ev.candidate.toJSON(),
        })
      } else {
        webrtcLog(tag, 'local ice gathering complete')
      }
    }

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      webrtcLog(tag, 'offer created; sending')
      this.session.sendSignal(remotePeerId, {
        type: 'offer',
        sdp: pc.localDescription!,
      })

      await Promise.all([waitForOpen(dcCtrl), waitForOpen(dcFile)])
      webrtcLog(tag, 'data channels open')
      await exchangeSessionReady(dcCtrl, this.session.id, remotePeerId)
      webrtcLog(tag, 'session.ready exchanged')

      this.bindFileReceive()
      this.bindCtrlApp()

      this.opened = true
      this.settleReady(null)
      this.callback.open(this)
    } catch (e) {
      if (supersededByOffer) {
        return
      }
      this.session.unregisterSignalHandler(remotePeerId)
      const err = e instanceof Error ? e : new Error(String(e))
      this.err = err
      this.closed = true
      pc.close()
      this.settleReady(err)
      this.callback.error(this, err)
    }
  }

  private bindFileReceive(): void {
    const ch = this.file
    if (!ch) {
      return
    }
    ch.onmessage = (ev) => {
      const sink = this.fileSink
      if (!sink) {
        return
      }
      const chunk = new Uint8Array(ev.data as ArrayBuffer)
      if (sink.total + chunk.byteLength > sink.size) {
        /* Sender exceeded declared size: abort transfer and drop the connection. */
        this.fileSink = null
        this.callback.fileOverflow?.(this)
        this.close()
        return
      }
      sink.received.push(chunk)
      sink.total += chunk.byteLength
      if (sink.total >= sink.size) {
        const blob = new Blob(sink.received as BlobPart[], { type: sink.mime })
        this.fileSink = null
        this.callback.fileReceived?.(this, sink.name, blob)
      }
    }
  }

  private bindCtrlApp(): void {
    const ch = this.ctrl
    if (!ch) {
      return
    }
    ch.addEventListener('message', (ev) => {
      void this.handleCtrl(ev)
    })
  }

  private async handleCtrl(ev: MessageEvent): Promise<void> {
    const msg = decodeCtrl(ev)
    if (!msg) {
      return
    }
    if (msg.kind === 'session.ready') {
      return
    }
    if (msg.kind === 'chat') {
      const name =
        msg.fromName?.trim() || getUserShowName(this.id)
      const text = msg.text?.trim()
      if (text) {
        this.callback.chatMessage?.(this, { name, payload: text })
      }
      if (msg.messageId) {
        void this.sendCtrl({
          v: PROTOCOL_V,
          kind: 'chat.ack',
          messageId: msg.messageId,
        })
      }
      return
    }
    if (msg.kind === 'chat.ack') {
      if (msg.messageId) {
        this.callback.chatAck?.(this, msg.messageId)
      }
      return
    }
    if (msg.kind === 'file.answer') {
      const p = this.pendingOffers.get(msg.transferId)
      if (p) {
        clearTimeout(p.timer)
        this.pendingOffers.delete(msg.transferId)
        p.resolve(msg.accept)
      }
      return
    }
    if (msg.kind === 'file.offer') {
      if (msg.size <= 0 || !Number.isFinite(msg.size)) {
        void this.sendCtrl({
          v: PROTOCOL_V,
          kind: 'file.answer',
          transferId: msg.transferId,
          accept: false,
        })
        return
      }
      const meta: FileOfferMeta = {
        transferId: msg.transferId,
        name: msg.name,
        size: msg.size,
        mime: msg.mime,
      }
      const respond = (accepted: boolean) => {
        void this.sendCtrl({
          v: PROTOCOL_V,
          kind: 'file.answer',
          transferId: msg.transferId,
          accept: accepted,
        })
        if (accepted) {
          this.fileSink = {
            transferId: msg.transferId,
            name: msg.name,
            size: msg.size,
            mime: msg.mime,
            received: [],
            total: 0,
          }
        }
      }
      if (this.callback.fileOffer) {
        this.callback.fileOffer(this, meta, respond)
      } else {
        respond(false)
      }
      return
    }
    if (msg.kind === 'file.done') {
      /* reserved for sender completion; receiver may already have full bytes */
      return
    }
  }

  private chCtrlOpen(): boolean {
    return this.ctrl !== null && this.ctrl.readyState === 'open'
  }

  private chFileOpen(): boolean {
    return this.file !== null && this.file.readyState === 'open'
  }

  private async sendCtrl(msg: CtrlMessage): Promise<void> {
    const ch = this.ctrl
    if (!ch || !this.chCtrlOpen()) {
      throw new Error('Control channel not open')
    }
    ch.send(JSON.stringify(msg))
  }

  /** Returns the `messageId` so the UI can track delivery via `chat.ack`. */
  sendChatText(body: string, onError?: (messageId: string) => void): string | null {
    const t = body.trim()
    if (!t) {
      return null
    }
    const fromName = getUserShowName(this.session.id)
    const messageId = crypto.randomUUID()
    this.sendCtrl({
      v: PROTOCOL_V,
      kind: 'chat',
      messageId,
      text: t,
      fromName,
    }).catch(() => onError?.(messageId))
    return messageId
  }

  async sendFileWithConsent(file: File, timeoutMs = 300_000): Promise<void> {
    if (!this.chCtrlOpen() || !this.chFileOpen()) {
      throw new Error('connection not open')
    }
    const fch = this.file!
    const transferId = crypto.randomUUID()
    const accepted = await new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        const p = this.pendingOffers.get(transferId)
        if (p) {
          clearTimeout(p.timer)
          this.pendingOffers.delete(transferId)
          p.promiseReject(new Error('Timed out waiting for receiver'))
        }
      }, timeoutMs)
      this.pendingOffers.set(transferId, {
        resolve,
        promiseReject: reject,
        timer,
      })
      this.sendCtrl({
        v: PROTOCOL_V,
        kind: 'file.offer',
        transferId,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
      }).catch((err) => {
        const p = this.pendingOffers.get(transferId)
        if (p) {
          clearTimeout(p.timer)
          this.pendingOffers.delete(transferId)
          p.promiseReject(err)
        }
      })
    })
    if (!accepted) {
      throw new Error('Receiver declined the transfer')
    }
    await sendBlobChunks(fch, file, FILE_CHUNK)
    await this.sendCtrl({
      v: PROTOCOL_V,
      kind: 'file.done',
      transferId,
    })
  }

  close() {
    if (this.closed) {
      return
    }
    this.settleReady(new Error('Connection closed'))
    clearPendingBooleanResponses(
      this.pendingOffers,
      new Error('Connection closed')
    )
    if (this.signalPeerId !== null) {
      this.session.unregisterSignalHandler(this.signalPeerId)
    } else {
      this.session.unregisterSignalHandler(this.id)
    }
    this.fileSink = null
    try {
      this.ctrl?.close()
    } catch {
      /* ignore */
    }
    this.ctrl = null
    try {
      this.file?.close()
    } catch {
      /* ignore */
    }
    this.file = null
    try {
      this.pc?.close()
    } catch {
      /* ignore */
    }
    this.pc = null
    this.closed = true
    this.opened = false
    this.callback.close(this)
    this.finallyCb?.()
  }
}
