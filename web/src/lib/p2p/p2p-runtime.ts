import type { SignalPayload } from './types'

/**
 * Narrow surface that `Connection` needs from the P2P coordinator.
 * Avoids importing the full `P2P` class from `connection.ts` (prevents circular modules).
 */
export interface P2PRuntime {
  readonly id: string
  sendSignal(to: string, payload: SignalPayload): void
  registerOutHandler(remoteId: string, fn: (p: SignalPayload) => void): void
  unregisterOutHandler(remoteId: string): void
  registerInHandler(remoteId: string, fn: (p: SignalPayload) => void): void
  unregisterInHandler(remoteId: string): void
  trackPc(pc: RTCPeerConnection): void
}
