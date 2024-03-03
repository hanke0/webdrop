import config from './config'

export function getRoomURL(room: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('room', room)
  return url.toString()
}

export function getRoomUserListURL(room: string) {
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
  return `${scheme}//${host}${port}${path}api/room/${room}/users`
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
