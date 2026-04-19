import 'dotenv/config'
import { createHash } from 'crypto'
import express from 'express'
import type { IncomingMessage } from 'http'
import { createServer } from 'http'
import morgan from 'morgan'
import helmet from 'helmet'
import { WebSocketServer, WebSocket } from 'ws'

// --- LAN room / client IP (default-room seeding) ---

/**
 * Client IP string from proxy headers or socket (Express / bare IncomingMessage).
 *
 * NOTE: x-real-ip and x-forwarded-for are trusted as-is. This is safe only when
 * a trusted reverse proxy (e.g. nginx) sits in front. If the server is exposed
 * directly, clients can spoof these headers to land in any LAN room.
 */
function getClientIp(req: IncomingMessage): string {
  const xReal = req.headers['x-real-ip']
  const forwarded = req.headers['x-forwarded-for']
  const fromForwarded =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : undefined
  const raw =
    (typeof xReal === 'string' && xReal.length > 0 ? xReal : undefined) ??
    fromForwarded ??
    req.socket.remoteAddress ??
    ''
  return typeof raw === 'string' ? raw.trim() : ''
}

function stripZoneAndV4Mapped(raw: string): string {
  let ip = raw.trim()
  const pct = ip.indexOf('%')
  if (pct >= 0) {
    ip = ip.slice(0, pct)
  }
  if (ip.toLowerCase().startsWith('::ffff:')) {
    ip = ip.slice(7)
  }
  return ip
}

function parseIPv4(s: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (!m) {
    return null
  }
  const nums = m.slice(1, 5).map((x) => parseInt(x, 10))
  if (nums.some((n) => n > 255 || Number.isNaN(n))) {
    return null
  }
  return nums as [number, number, number, number]
}

function normalizeHextet(h: string): string {
  return h.toLowerCase().padStart(4, '0')
}

function expandIPv6Groups(s: string): string[] | null {
  if (!s.includes(':')) {
    return null
  }
  const parts = s.split('::')
  if (parts.length > 2) {
    return null
  }
  const left = parts[0] ? parts[0].split(':').filter((p) => p.length > 0) : []
  const right =
    parts.length === 2 && parts[1]
      ? parts[1].split(':').filter((p) => p.length > 0)
      : []
  if (parts.length === 1) {
    if (left.length !== 8) {
      return null
    }
    return left.map(normalizeHextet)
  }
  const missing = 8 - left.length - right.length
  if (missing < 0) {
    return null
  }
  const all = [...left, ...Array(missing).fill('0'), ...right]
  if (all.length !== 8) {
    return null
  }
  return all.map(normalizeHextet)
}

/**
 * Stable seed per LAN segment: private IPv4 → /24; public IPv4 → full address;
 * IPv6 → /64 when parsable; ::1 → loopback bucket.
 */
function subnetSeedForLanRoom(ipRaw: string): string {
  const ip = stripZoneAndV4Mapped(ipRaw)
  if (!ip) {
    return 'unknown'
  }

  const v4 = parseIPv4(ip)
  if (v4) {
    const [a, b, c, d] = v4
    const useSlash24 =
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 127 ||
      (a === 169 && b === 254)
    if (useSlash24) {
      return `v4:${a}.${b}.${c}.0`
    }
    return `v4:${a}.${b}.${c}.${d}`
  }

  if (ip === '::1') {
    return 'v6:loopback'
  }

  const g = expandIPv6Groups(ip)
  if (g && g.length >= 4) {
    return `v6:${g.slice(0, 4).join(':')}::`
  }
  return `v6:${ip}`
}

/** 6-char room code from subnet seed (MD5 → custom base64). */
function roomCodeFromSeed(seed: string): string {
  const bname = createHash('md5').update(seed).digest('base64')
  let name = ''
  for (let b of bname) {
    b = b.toUpperCase()
    switch (b) {
      case '+':
        name += '0'
        break
      case '/':
        name += '1'
        break
      case '=':
        name += '2'
        break
      default:
        name += b
    }
    if (name.length === 6) {
      break
    }
  }
  while (name.length !== 6) {
    name += 'Z'
  }
  return name
}

function defaultRoomFromRequest(req: IncomingMessage): string {
  const ip = getClientIp(req)
  const seed = ip ? subnetSeedForLanRoom(ip) : 'unknown'
  return roomCodeFromSeed(seed)
}

// --- HTTP / WebSocket app ---

const app = express()
const server = createServer(app)

app.set('trust proxy', 1)
app.use(helmet())
app.use(morgan('short'))

const WS_PATH = '/api/v2/ws'

const ROOM_RE = /^[A-Z0-9]{6}$/
const USER_RE = /^[a-z]+-[a-z]+$/

const WS_CLOSE_BAD_REQUEST = 4000
const WS_CLOSE_USERNAME_IN_USE = 4002

type Peer = {
  peerId: string
  room: string
  ws: WebSocket
}

/** room id → peerId → Peer */
const rooms = new Map<string, Map<string, Peer>>()

function roomPeerIds(roomId: string, except?: string): string[] {
  const m = rooms.get(roomId)
  if (!m) {
    return []
  }
  const out: string[] = []
  for (const p of m.values()) {
    if (p.peerId !== except) {
      out.push(p.peerId)
    }
  }
  return out
}

function broadcast(roomId: string, payload: unknown, except?: WebSocket): void {
  const m = rooms.get(roomId)
  if (!m) {
    return
  }
  const data = JSON.stringify(payload)
  for (const p of m.values()) {
    if (p.ws === except) {
      continue
    }
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(data)
    }
  }
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

type ClientMsg = {
  type?: unknown
  to?: unknown
  body?: unknown
}

// Signaling messages are small (SDP / ICE candidates); cap at 64 KB to prevent
// large-payload abuse on the parse/stringify path.
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

wss.on('connection', (ws, req) => {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const user = (url.searchParams.get('user') ?? '').toLowerCase()
  if (!USER_RE.test(user) || user.length > 60) {
    ws.close(WS_CLOSE_BAD_REQUEST, 'invalid user')
    return
  }

  const roomParam = url.searchParams.get('room') ?? ''
  const room =
    roomParam && ROOM_RE.test(roomParam) ? roomParam : defaultRoomFromRequest(req)
  const peerId = `${room}-${user}`

  let m = rooms.get(room)
  if (!m) {
    m = new Map()
    rooms.set(room, m)
  }
  const existing = m.get(peerId)
  if (existing && existing.ws.readyState === WebSocket.OPEN) {
    ws.close(WS_CLOSE_USERNAME_IN_USE, 'username_in_use')
    return
  }

  const peer: Peer = { peerId, room, ws }
  m.set(peerId, peer)

  send(ws, {
    type: 'welcome',
    room,
    peerId,
    peers: roomPeerIds(room, peerId),
  })
  broadcast(room, { type: 'peer.join', peerId }, ws)

  ws.on('message', (raw) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(raw.toString()) as ClientMsg
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') {
      return
    }
    if (msg.type === 'signal') {
      if (
        typeof msg.to !== 'string' ||
        msg.body === null ||
        typeof msg.body !== 'object' ||
        Array.isArray(msg.body)
      ) {
        return
      }
      const target = rooms.get(room)?.get(msg.to)
      if (target && target.ws.readyState === WebSocket.OPEN) {
        send(target.ws, { type: 'signal', from: peerId, body: msg.body })
      }
      return
    }
    if (msg.type === 'peers') {
      send(ws, { type: 'peers', peers: roomPeerIds(room, peerId) })
      return
    }
  })

  ws.on('close', () => {
    const mm = rooms.get(room)
    if (!mm) {
      return
    }
    if (mm.get(peerId) === peer) {
      mm.delete(peerId)
      broadcast(room, { type: 'peer.leave', peerId })
      if (mm.size === 0) {
        rooms.delete(room)
      }
    }
  })
})

server.on('upgrade', (request, socket, head) => {
  const host = request.headers.host ?? 'localhost'
  const path = new URL(request.url ?? '/', `http://${host}`).pathname
  if (path !== WS_PATH) {
    socket.destroy()
    return
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

function listenHost(): string {
  const raw = process.env.HOST?.trim()
  return raw && raw.length > 0 ? raw : 'localhost'
}

function listenPort(): number {
  const raw = process.env.PORT?.trim()
  const n = parseInt(raw && raw.length > 0 ? raw : '10234', 10)
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : 8080
}

app.use('/', express.static('dist'))

const host = listenHost()
const port = listenPort()
server.listen(
  {
    host,
    port,
    exclusive: true,
  },
  () => {
    console.log(`Server is running on http://${host}:${port}`)
    console.log(`Unified WebSocket path: ${WS_PATH}`)
  }
)

server.on('error', (error) => {
  console.error('Server error:', error)
  process.exit(1)
})
