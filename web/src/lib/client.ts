/** REST + WebSocket signaling under same host as the page (dev: Vite proxies `/api/v1`). */
const API_V1_PREFIX = '/api/v1'

function apiV1Base(): string {
  const { protocol, host } = window.location
  let path = API_V1_PREFIX
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
  const { protocol, host } = window.location
  const wsScheme = protocol === 'https:' ? 'wss:' : 'ws:'
  const base = API_V1_PREFIX.replace(/\/+$/, '') || '/api/v1'
  const pathSeg = `${base.startsWith('/') ? base : `/${base}`}/signal`
  const q = new URLSearchParams({ room, logicalId })
  return `${wsScheme}//${host}${pathSeg}?${q}`
}

export function getRoomUserListURL(room: string) {
  return `${apiV1Base()}room/${room}/users`
}

export function getRoomPresenceURL(room: string) {
  return `${apiV1Base()}room/${room}/presence`
}

/** Server maps client subnet → room code (same /24 LAN → same room). */
export function getDefaultRoomURL(): string {
  return `${apiV1Base()}default-room`
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
