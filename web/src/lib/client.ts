import config from './config'

export function getRoomURL(room: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('room', room)
  return url.toString()
}

function peerApiOrigin(): string {
  let host = config.PEER_HOSTNAME || window.location.hostname
  if (host === '/') {
    host = window.location.hostname
  }
  let port = config.PEER_PORT || window.location.port
  if (port) {
    port = `:${port}`
  }
  let path = config.PEER_PATH || '/'
  if (!path.endsWith('/')) {
    path = `${path}/`
  }
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  const scheme = window.location.protocol || 'https:'
  return `${scheme}//${host}${port}${path}`
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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
