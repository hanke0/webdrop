/**
 * WebRTC signaling + dual data channels. Import from `lib/webrtc` or `lib/p2p` re-export.
 */

export type { SessionError, FileOfferMeta, SessionOptions } from './types'
export type { PeerLinkCallback } from './peer-link'
export { RoomSession } from './room-session'
export type { SessionRuntime } from './session-runtime'
export { PeerLink } from './peer-link'
export { LazyConnectionImpl, type LazyConnection } from './lazy-connection'
export { resolvePeerId } from './connect-id'
export { PROTOCOL_V, CTRL_LABEL, FILE_LABEL } from './constants'
