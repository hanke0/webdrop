import type { SignalBody } from './types'

/** Narrow surface `PeerLink` needs from `RoomSession`. */
export interface SessionRuntime {
  readonly id: string
  sendSignal(to: string, body: SignalBody): void
  registerSignalHandler(
    remotePeerId: string,
    fn: (body: SignalBody) => void
  ): void
  unregisterSignalHandler(remotePeerId: string): void
  trackPc(pc: RTCPeerConnection): void
}
