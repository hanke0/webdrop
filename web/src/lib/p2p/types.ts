/** P2P wire messages (discriminated by `type`). */
export type WireData =
  | { type: 'text'; name: string; payload: string }
  | { type: 'chat-invite'; inviteId: string }
  | { type: 'chat-invite-response'; inviteId: string; accepted: boolean }
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

export type FileOfferMeta = {
  transferId: string
  name: string
  size: number
}

export type ChatInviteMeta = {
  inviteId: string
}

/** WebRTC signaling payloads exchanged over the WebSocket. */
export type SignalPayload =
  | { t: 'offer'; sdp: RTCSessionDescriptionInit }
  | { t: 'answer'; sdp: RTCSessionDescriptionInit }
  | { t: 'ice'; c: RTCIceCandidateInit }
