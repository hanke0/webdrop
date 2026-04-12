import { icons, prefixes } from './names'
import { fetchDefaultRoom } from './api'

const roomRE = /^[A-Z0-9]{6}$/
export function isGoodRoom(room: string): boolean {
  return roomRE.test(room)
}

const usernameRE = /^[a-z]+-[a-z]+$/
export function isGoodUser(user: string): boolean {
  return usernameRE.test(user) && icons.includes(user.split('-')[1])
}

const roomAndNameRE = /^[A-Z0-9]{6}-[a-z]+-[a-z]+$/
export function isGoodRoomAndName(id: string): boolean {
  return roomAndNameRE.test(id)
}

const alnum = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Persisted on the SPA origin so refresh keeps the same room. */
export const SESSION_ROOM_STORAGE_KEY = 'webdrop_session_room'
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
 * Room for this browser session:
 * URL → localStorage → subnet **default-room** API → random.
 */
export async function resolveSessionRoom(
  search: URLSearchParams
): Promise<string> {
  const fromQuery = search.get('room')
  if (fromQuery && isGoodRoom(fromQuery)) {
    storageSet(SESSION_ROOM_STORAGE_KEY, fromQuery)
    return fromQuery
  }
  const stored = storageGet(SESSION_ROOM_STORAGE_KEY)
  if (stored && isGoodRoom(stored)) {
    return stored
  }
  try {
    const data = await fetchDefaultRoom()
    if (data && isGoodRoom(data.room)) {
      storageSet(SESSION_ROOM_STORAGE_KEY, data.room)
      return data.room
    }
  } catch {
    /* offline / blocked */
  }
  const created = randomRoom()
  storageSet(SESSION_ROOM_STORAGE_KEY, created)
  return created
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

export function randomRoom(): string {
  const chars = alnum.split('')
  let out = ''
  for (let i = 0; i < 6; i++) {
    const j = Math.floor(Math.random() * chars.length)
    out += chars[j]!
    chars.splice(j, 1)
  }
  return out
}

export function randomUser(): string {
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  const name = icons[Math.floor(Math.random() * icons.length)]
  return `${prefix}-${name}`
}

/** Current origin with `?room=` (share link only; does not call the API). */
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
