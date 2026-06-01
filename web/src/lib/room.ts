import { icons, prefixes } from './names'

const roomRE = /^[A-Z0-9]{6}$/
export function isGoodRoom(room: string): boolean {
  return roomRE.test(room)
}

/** Uppercase A–Z / 0–9 only, max 6 characters (room code input). */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

const usernameRE = /^[a-z]+-[a-z]+$/
export function isGoodUser(user: string): boolean {
  return usernameRE.test(user) && icons.includes(user.split('-')[1])
}

const roomAndNameRE = /^[A-Z0-9]{6}-[a-z]+-[a-z]+$/
export function isGoodRoomAndName(id: string): boolean {
  return roomAndNameRE.test(id)
}

export const SESSION_USER_STORAGE_KEY = 'webdrop_session_user'

function storageGet(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode / quota */
  }
}

/**
 * Room override from the URL query (`?room=`). If missing, the server picks
 * one based on the client's subnet.
 */
export function resolveRoomOverride(search: URLSearchParams): string | null {
  const fromQuery = search.get('room')
  if (fromQuery && isGoodRoom(fromQuery)) {
    return fromQuery
  }
  return null
}

/** Display user id: URL → localStorage → random. */
export function resolveSessionUser(search: URLSearchParams): string {
  const fromQuery = search.get('user')
  if (fromQuery && isGoodUser(fromQuery)) {
    storageSet(SESSION_USER_STORAGE_KEY, fromQuery)
    return fromQuery
  }
  const stored = storageGet(SESSION_USER_STORAGE_KEY)
  if (stored && isGoodUser(stored)) {
    return stored
  }
  const created = randomUser()
  storageSet(SESSION_USER_STORAGE_KEY, created)
  return created
}

export function randomUser(): string {
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  const name = icons[Math.floor(Math.random() * icons.length)]
  return `${prefix}-${name}`
}

/** Current origin with `?room=` (share link; server still honours it). */
export function getRoomURL(room: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('room', room)
  return url.toString()
}

export const getRoom = (uid: string): string => {
  if (isGoodRoomAndName(uid)) {
    return uid.split('-')[0]
  }
  return ''
}

export const getUserIconPath = (uid: string): string => {
  let name = ''
  if (isGoodUser(uid)) {
    name = uid.split('-')[1]
  } else if (isGoodRoomAndName(uid)) {
    name = uid.split('-')[2]
  }
  if (name && icons.includes(name)) {
    return `/icons/${name}.svg`
  }
  return '/icons/default.svg'
}

function _getUserShowName(prefix: string, name: string): string {
  return prefix.charAt(0).toUpperCase() + prefix.slice(1) + ' '
    + name.charAt(0).toUpperCase() + name.slice(1)
}

export const getUserShowName = (uid: string): string => {
  if (isGoodUser(uid)) {
    const parts = uid.split('-')
    return _getUserShowName(parts[0], parts[1])
  }
  if (isGoodRoomAndName(uid)) {
    const parts = uid.split('-')
    if (parts.length === 3) {
      return _getUserShowName(parts[1], parts[2])
    }
  }
  return uid
}

export const splitRoomAndUser = (uid: string): [string, string] | [] => {
  if (!isGoodRoomAndName(uid)) {
    return []
  }
  const index = uid.indexOf('-')
  if (index === -1) {
    return []
  }
  return [uid.substring(0, index), uid.substring(index + 1)]
}
