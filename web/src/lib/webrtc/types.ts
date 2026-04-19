/** WebRTC signaling payloads over WebSocket `body` (`/api/v2`). */
export type SignalBody =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit }

/** Control-channel JSON (`webdrop-ctrl`). */
export type CtrlMessage =
  | { v: 2; kind: 'session.ready'; peerId: string }
  | {
      v: 2
      kind: 'chat'
      text: string
      messageId?: string
      fromName?: string
    }
  | {
      v: 2
      kind: 'file.offer'
      transferId: string
      name: string
      size: number
      mime: string
    }
  | {
      v: 2
      kind: 'file.answer'
      transferId: string
      accept: boolean
    }
  | { v: 2; kind: 'file.done'; transferId: string }

export type SessionOptions = {
  room: string
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
