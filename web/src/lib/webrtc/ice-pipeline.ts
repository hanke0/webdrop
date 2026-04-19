import { candidateType, webrtcLog } from './log'

/**
 * Buffers ICE candidates until `setRemoteDescription` has been applied, then
 * applies queued and live candidates the same way for inbound and outbound.
 */
export class IceCandidatePipeline {
  private readonly early: RTCIceCandidateInit[] = []
  private remoteDescriptionReady = false

  constructor(
    private readonly pc: RTCPeerConnection,
    private readonly label: string
  ) {}

  onSignalIce(c: RTCIceCandidateInit): void {
    if (this.remoteDescriptionReady) {
      void this.addCandidate(c)
    } else {
      webrtcLog(this.label, 'remote ice queued (typ)', candidateType(c))
      this.early.push(c)
    }
  }

  /** Call after a successful `setRemoteDescription` (offer or answer). */
  async flushEarly(): Promise<void> {
    this.remoteDescriptionReady = true
    if (this.early.length > 0) {
      webrtcLog(
        this.label,
        `flushing ${this.early.length} early remote candidate(s)`
      )
    }
    for (const c of this.early) {
      await this.addCandidate(c)
    }
    this.early.length = 0
  }

  private async addCandidate(c: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(c))
      webrtcLog(this.label, 'remote ice applied (typ)', candidateType(c))
    } catch (e) {
      console.warn(`addIceCandidate (${this.label}):`, e)
    }
  }
}
