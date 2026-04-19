/** Same as server close code when same username is already connected in the room. */
export const SIGNAL_USERNAME_IN_USE_CODE = 4002

export const PROTOCOL_V = 2

export const CTRL_LABEL = 'webdrop-ctrl'
export const FILE_LABEL = 'webdrop-file'

/** Max binary payload per chunk on the file data channel. */
export const FILE_CHUNK = 256 * 1024

export const rtcConfig: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        // Google
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        // Cloudflare
        'stun:stun.cloudflare.com:3478',
        // China-friendly
        'stun:stun.miwifi.com:3478',
        'stun:stun.qq.com:3478',
      ],
    },
  ],
}
