/** Must match server `WS_CLOSE_USERNAME_IN_USE` (same room + display name already online). */
export const SIGNAL_USERNAME_IN_USE_CODE = 4002

export const FRAME_JSON = 0
export const FRAME_BIN = 1

/** Max binary payload per `writeDcFrame` chunk over the data channel. */
export const FILE_CHUNK = 256 * 1024

export const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}
