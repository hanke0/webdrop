/** Same as server close code when same username is already connected in the room. */
export const SIGNAL_USERNAME_IN_USE_CODE = 4002

export const PROTOCOL_V = 2

export const CTRL_LABEL = 'webdrop-ctrl'
export const FILE_LABEL = 'webdrop-file'

/** Max binary payload per chunk on the file data channel. */
export const FILE_CHUNK = 256 * 1024

export const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}
