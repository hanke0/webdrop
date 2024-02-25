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

export function getRoomAndUid(): [string, string] {
  const [uid, room] = getLocationParams(['uid', 'room'])
  return [room, uid]
}

export function getCookieParam(names: string[]): string[] {
  return names.map((name) => Cookies.get(name) || '')
}

export function getRoomFromCookie(): string {
  return Cookies.get('useriproom') || ''
}

export function getRoomURL(room: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('room', room)
  return url.toString()
}
