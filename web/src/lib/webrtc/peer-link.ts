import { getUserShowName } from '../room'
import toast from 'react-hot-toast'
import i18n from '../../i18n'
import fileDownload from 'js-file-download'
import {
  CTRL_LABEL,
  FILE_CHUNK,
  FILE_LABEL,
  PROTOCOL_V,
  rtcConfig,
} from './constants'
import { sendBinaryChunks } from './dc-send'
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
  chatMessage?: (
    conn: PeerLink,
    msg: { name: string; payload: string }
  ) => void
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
    const t = setTimeout(() => reject(new Error('datachannel timeout')), 60_000)
    const tryDone = () => {
      if (parts.c && parts.f) {
        clearTimeout(t)
        pc.removeEventListener('datachannel', onDc)
        resolve({ ctrl: parts.c, file: parts.f })
      }
    }
    const onDc = (ev: RTCDataChannelEvent) => {
      const ch = ev.channel
      if (ch.label === CTRL_LABEL) {
        parts.c = ch
      } else if (ch.label === FILE_LABEL) {
        ch.binaryType = 'arraybuffer'
        parts.f = ch
      }
      tryDone()
    }
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
    const t = setTimeout(
      () => reject(new Error('session.ready timeout')),
      30_000
    )
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
      this.readyResolve()
      this.callback.open(this)
    } else {
      this.signalPeerId = null
      void this.openOutbound()
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
    session.trackPc(pc)
    attachPcLogging(pc, tag)

    const icePipe = new IceCandidatePipeline(pc, tag)
    const channelsPromise = waitForInboundChannels(pc)

    session.registerSignalHandler(signalPeerId, (body: SignalBody) => {
      void (async () => {
        if (body.type === 'ice') {
          icePipe.onSignalIce(body.candidate)
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
      console.warn(`[webrtc ${tag}] acceptOffer failed:`, e)
      session.unregisterSignalHandler(signalPeerId)
      pc.close()
      return null
    }
  }

  private async openOutbound(): Promise<void> {
    const remotePeerId = this.id
    const tag = `out ${remotePeerId}`

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
      this.readyResolve()
      this.callback.open(this)
    } catch (e) {
      this.session.unregisterSignalHandler(remotePeerId)
      const err = e instanceof Error ? e : new Error(String(e))
      this.err = err
      this.closed = true
      pc.close()
      this.readyReject(err)
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
      sink.received.push(chunk)
      sink.total += chunk.byteLength
      if (sink.total >= sink.size) {
        const blob = new Blob(sink.received as BlobPart[], { type: sink.mime })
        toast(`receive file ${sink.name}`, { icon: '📁' })
        fileDownload(blob, sink.name)
        this.fileSink = null
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
      this.callback.fileOffer?.(this, meta, respond)
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
      toast.error(i18n.t('conn.notOpen', { id: this.id }))
      return
    }
    ch.send(JSON.stringify(msg))
  }

  sendChatText(body: string): void {
    const t = body.trim()
    if (!t) {
      return
    }
    const fromName = getUserShowName(this.session.id)
    void this.sendCtrl({
      v: PROTOCOL_V,
      kind: 'chat',
      messageId: crypto.randomUUID(),
      text: t,
      fromName,
    })
  }

  async sendFileWithConsent(file: File, timeoutMs = 300_000): Promise<void> {
    if (!this.chCtrlOpen() || !this.chFileOpen()) {
      toast.error(i18n.t('conn.notOpen', { id: this.id }))
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
      void this.sendCtrl({
        v: PROTOCOL_V,
        kind: 'file.offer',
        transferId,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
      })
    })
    if (!accepted) {
      throw new Error('Receiver declined the transfer')
    }
    const ab = await file.arrayBuffer()
    const u8 = new Uint8Array(ab)
    await sendBinaryChunks(fch, u8, FILE_CHUNK)
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
