export function webrtcLog(tag: string, ...args: unknown[]): void {
  console.log(`[webrtc ${tag}]`, ...args)
}

/** Extract "typ <foundation>" from an ICE candidate string: host/srflx/relay/prflx. */
export function candidateType(c: RTCIceCandidateInit | RTCIceCandidate): string {
  const s = (c as RTCIceCandidateInit).candidate || ''
  const m = /\btyp\s+(\S+)/.exec(s)
  return m?.[1] ?? '?'
}

/** Subscribe to RTCPeerConnection state events and log transitions with elapsed time. */
export function attachPcLogging(pc: RTCPeerConnection, tag: string): void {
  const t0 = performance.now()
  const ts = () => `+${Math.round(performance.now() - t0)}ms`
  webrtcLog(tag, 'pc created')
  pc.addEventListener('iceconnectionstatechange', () => {
    webrtcLog(tag, 'iceConnectionState=', pc.iceConnectionState, ts())
  })
  pc.addEventListener('icegatheringstatechange', () => {
    webrtcLog(tag, 'iceGatheringState=', pc.iceGatheringState, ts())
  })
  pc.addEventListener('connectionstatechange', () => {
    webrtcLog(tag, 'connectionState=', pc.connectionState, ts())
  })
  pc.addEventListener('signalingstatechange', () => {
    webrtcLog(tag, 'signalingState=', pc.signalingState, ts())
  })
  pc.addEventListener('icecandidateerror', (ev) => {
    const e = ev as RTCPeerConnectionIceErrorEvent
    console.warn(
      `[webrtc ${tag}] icecandidateerror url=${e.url} code=${e.errorCode} text=${e.errorText}`
    )
  })
}
