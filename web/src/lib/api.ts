/**
 * All HTTP and WebSocket access to the backend (`/api/v1`).
 * Dev: Vite proxies `/api/v1` to the Node server.
 */

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
      return null
    }
    const data = (await res.json()) as { room?: string }
    if (typeof data.room === 'string') {
      return { room: data.room }
    }
    return null
  } catch {
    return null
  }
}

/** Presence list for a room (`GET /api/v1/room/:room/users`). */
export async function fetchRoomUsers(
  room: string
): Promise<RoomUserListItem[]> {
  const res = await fetch(roomUsersUrl(room))
  if (!res.ok) {
    throw new Error(res.statusText)
  }
  return (await res.json()) as RoomUserListItem[]
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
    }
  } catch (e) {
    console.warn('presence POST error:', e)
  }
}

/** WebRTC signaling (`WS /api/v1/signal`). */
export function connectSignalingWebSocket(
  room: string,
  logicalId: string
): WebSocket {
  return new WebSocket(signalingWebSocketUrl(room, logicalId))
}
