/**
 * WebRTC + data-channel stack. Implementation is split under `./p2p/` for readability;
 * import from `lib/p2p` (re-export) elsewhere in the app.
 */
export type {
  ChatInviteMeta,
  FileOfferMeta,
  Options,
  P2PError,
  SignalPayload,
  WireData,
} from './types'
export { P2P } from './p2p-coordinator'
export type { P2PRuntime } from './p2p-runtime'
export { Connection, type ConnectionCallback } from './connection'
export { LazyConnectionImpl, type LazyConnection } from './lazy-connection'

/** Pure helpers (useful in unit tests). */
export { signalingClosedMessage } from './signaling-ws'
export { SIGNAL_USERNAME_IN_USE_CODE } from './constants'
export { parseHelloJsonPayload } from './hello'
export { parseDcFrameHeader } from './data-channel'
export { resolveOutboundLogicalId } from './connect-id'
export {
  clearPendingBooleanResponses,
  type PendingBooleanResponse,
} from './pending'
