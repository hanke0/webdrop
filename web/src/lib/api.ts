/**
 * All HTTP and WebSocket access to the backend (`/api/v1`).
 * Dev: Vite proxies `/api/v1` to the Node server.
 */

import toast from 'react-hot-toast'

const API_V1_PREFIX = '/api/v1'

function toastHttpError(label: string, res: Response): void {
  const tail = res.statusText ? ` ${res.statusText}` : ''
  toast.error(`${label} failed (${res.status})${tail}`)
}

function toastPresenceHttpError(res: Response): void {
  const tail = res.statusText ? ` ${res.statusText}` : ''
  toastPresenceError(`Presence update failed (${res.status})${tail}`)
}

function toastNetworkError(label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  toast.error(`${label} failed: ${msg}`)
}

let lastPresenceErrorToastAt = 0
const PRESENCE_ERROR_TOAST_COOLDOWN_MS = 60_000

function toastPresenceError(message: string): void {
  const now = Date.now()
  if (now - lastPresenceErrorToastAt < PRESENCE_ERROR_TOAST_COOLDOWN_MS) {
    return
  }
  lastPresenceErrorToastAt = now
  toast.error(message)
}

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

function roomUsersUrl(room: string): string {
  return `${apiV1Base()}room/${room}/users`
}

function roomPresenceUrl(room: string): string {
  return `${apiV1Base()}room/${room}/presence`
}

function defaultRoomUrl(): string {
  return `${apiV1Base()}default-room`
}

function signalingWebSocketUrl(room: string, logicalId: string): string {
  const { protocol, host } = window.location
  const wsScheme = protocol === 'https:' ? 'wss:' : 'ws:'
  const base = API_V1_PREFIX.replace(/\/+$/, '') || '/api/v1'
  const pathSeg = `${base.startsWith('/') ? base : `/${base}`}/signal`
  const q = new URLSearchParams({ room, logicalId })
  return `${wsScheme}//${host}${pathSeg}?${q}`
}

export type RoomUserListItem = { id: string; addrs?: string[] }

/** Subnet-based default room from the server; returns `null` if unavailable. */
export async function fetchDefaultRoom(): Promise<{ room: string } | null> {
  try {
    const res = await fetch(defaultRoomUrl())
    if (!res.ok) {
      toastHttpError('Default room', res)
      return null
    }
    let data: { room?: string }
    try {
      data = (await res.json()) as { room?: string }
    } catch {
      toast.error('Default room: invalid response from server')
      return null
    }
    if (typeof data.room === 'string') {
      return { room: data.room }
    }
    toast.error('Default room: server did not return a room code')
    return null
  } catch (e) {
    toastNetworkError('Default room', e)
    return null
  }
}

/** Presence list for a room (`GET /api/v1/room/:room/users`). */
export async function fetchRoomUsers(
  room: string
): Promise<RoomUserListItem[]> {
  let res: Response
  try {
    res = await fetch(roomUsersUrl(room))
  } catch (e) {
    toastNetworkError('Room user list', e)
    throw e
  }
  if (!res.ok) {
    toastHttpError('Room user list', res)
    throw new Error(`Room user list failed (${res.status})`)
  }
  try {
    return (await res.json()) as RoomUserListItem[]
  } catch (e) {
    toastNetworkError('Room user list (parse response)', e)
    throw new Error('Room user list: invalid JSON from server')
  }
}

/** Heartbeat / address registration (`POST /api/v1/room/:room/presence`). */
export async function postRoomPresence(
  room: string,
  logicalId: string,
  addrs: string[]
): Promise<void> {
  try {
    const res = await fetch(roomPresenceUrl(room), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logicalId, addrs }),
    })
    if (!res.ok) {
      console.warn('presence POST failed:', res.status)
      toastPresenceHttpError(res)
    }
  } catch (e) {
    console.warn('presence POST error:', e)
    toastPresenceError(
      e instanceof Error ? e.message : `Presence update failed: ${String(e)}`
    )
  }
}

/** WebRTC signaling (`WS /api/v1/signal`). */
export function connectSignalingWebSocket(
  room: string,
  logicalId: string
): WebSocket {
  return new WebSocket(signalingWebSocketUrl(room, logicalId))
}
