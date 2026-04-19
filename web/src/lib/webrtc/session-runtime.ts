import type { PeerLinkCallback } from './peer-link'
import type { SignalBody } from './types'

/** Narrow surface `PeerLink` needs from `RoomSession`. */
export interface SessionRuntime {
  readonly id: string
  sendSignal(to: string, body: SignalBody): void
  acceptIncomingOffer(
    remotePeerId: string,
    sdp: RTCSessionDescriptionInit,
    callback: PeerLinkCallback
  ): Promise<void>
  registerSignalHandler(
    remotePeerId: string,
    fn: (body: SignalBody) => void
  ): void
  unregisterSignalHandler(remotePeerId: string): void
  trackPc(pc: RTCPeerConnection): void
}
