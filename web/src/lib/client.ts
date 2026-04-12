/** API + WebSocket signaling under same host as the page (dev: Vite proxies `/peer`). */
const PEER_PATH = '/peer/'

function peerApiOrigin(): string {
  const { protocol, host } = window.location
  let path = PEER_PATH
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  if (!path.endsWith('/')) {
    path = `${path}/`
  }
  return `${protocol}//${host}${path}`
}

export function getRoomURL(room: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('room', room)
  return url.toString()
}

export function getSignalWebSocketURL(room: string, logicalId: string): string {
  const origin = peerApiOrigin()
  const u = new URL(origin)
  const wsScheme = u.protocol === 'https:' ? 'wss:' : 'ws:'
  const base = u.pathname.replace(/\/+$/, '') || ''
  const pathSeg = base === '' ? '/signal' : `${base}/signal`
  const q = new URLSearchParams({ room, logicalId })
  return `${wsScheme}//${u.host}${pathSeg}?${q}`
}

export function getRoomUserListURL(room: string) {
  return `${peerApiOrigin()}api/room/${room}/users`
}

export function getRoomPresenceURL(room: string) {
  return `${peerApiOrigin()}api/room/${room}/presence`
}

/** Server maps client subnet → room code (same /24 LAN → same room). */
export function getDefaultRoomURL(): string {
  return `${peerApiOrigin()}api/default-room`
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
