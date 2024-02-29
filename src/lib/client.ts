import config from './config'
import Cookies from 'js-cookie'

export function getLocationParams(names: string[]): string[] {
  try {
    const param = new URLSearchParams(window.location.search)
    return names.map((name) => param.get(name) || '')
  } catch (error) {
    console.error(error)
    return []
  }
}

export function getRoomAndUser(): [string, string] {
  const [uid, room] = getLocationParams(['uid', 'room'])
  return [room, uid]
}

export function getCookieParam(names: string[]): string[] {
  return names.map((name) => Cookies.get(name) || '')
}

export function getLocalRoom(): string {
  return Cookies.get('useriproom') || ''
}

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
