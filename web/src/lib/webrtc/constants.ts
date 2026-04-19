/** Same as server close code when same username is already connected in the room. */
export const SIGNAL_USERNAME_IN_USE_CODE = 4002

export const PROTOCOL_V = 3

export const CTRL_LABEL = 'webdrop-ctrl'
export const FILE_LABEL = 'webdrop-file'

/** Max binary payload per chunk on the file data channel. */
export const FILE_CHUNK = 256 * 1024

/**
 * Empty `iceServers`: only host (and mDNS-masked host) candidates are produced,
 * so peers can only reach each other over the LAN.
 */
export const rtcConfig: RTCConfiguration = {
  iceServers: [],
}
