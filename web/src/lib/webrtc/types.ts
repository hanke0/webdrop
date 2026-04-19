/** WebRTC signaling payloads exchanged over the unified WebSocket `body` field. */
export type SignalBody =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit }

/** Control-channel JSON (`webdrop-ctrl`). */
export type CtrlMessage =
  | { v: 3; kind: 'session.ready'; peerId: string }
  | {
      v: 3
      kind: 'chat'
      text: string
      messageId: string
      fromName?: string
    }
  | { v: 3; kind: 'chat.ack'; messageId: string }
  | {
      v: 3
      kind: 'file.offer'
      transferId: string
      name: string
      size: number
      mime: string
    }
  | {
      v: 3
      kind: 'file.answer'
      transferId: string
      accept: boolean
    }
  | { v: 3; kind: 'file.done'; transferId: string }

export type SessionOptions = {
  /** Optional room override. If omitted the server derives one from the client IP. */
  room?: string
  user: string
}

export interface SessionError {
  type: string
  err: string | Error
}

export type FileOfferMeta = {
  transferId: string
  name: string
  size: number
  mime: string
}
