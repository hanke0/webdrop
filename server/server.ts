import 'dotenv/config'
import { createHash } from 'crypto'
import express from 'express'
import type { IncomingMessage } from 'http'
import { createServer } from 'http'
import morgan from 'morgan'
import helmet from 'helmet'
import { WebSocketServer, WebSocket } from 'ws'

// --- LAN room / client IP (default-room seeding) ---

/** Client IP string from proxy headers or socket (Express / bare IncomingMessage). */
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

// --- HTTP / WebSocket app ---

const app = express()
const server = createServer(app)

app.set('trust proxy', 1)
app.use(helmet())
app.use(morgan('short'))
app.use(express.json({ limit: '512kb' }))

const cleanPath = (path: string) => {
  const end = path.endsWith('/') ? path.length - 1 : path.length
  const start = path.startsWith('/') ? 1 : 0
  return path.slice(start, end)
}

const _u = (url: string, prefix: string) => {
  if (url == '/' || !url) {
    return `/${cleanPath(prefix)}`
  }
  return `/${cleanPath(prefix)}/${cleanPath(url)}`
}

const STATIC_PREFIX = '/'
const API_V2_PREFIX = '/api/v2'

const u = (url: string) => {
  return _u(url, STATIC_PREFIX)
}

const v2 = (url: string) => {
  return _u(url, API_V2_PREFIX)
}

const signalPathV2 = v2('/signal')

const roomID = /^[A-Z0-9]{6}$/

function roomParam(
  p: string | string[] | undefined
): string | undefined {
  if (p == null) {
    return undefined
  }
  return Array.isArray(p) ? p[0] : p
}

/** ROOM + adjective-noun-adjective peer id → room code */
function peerIdRoom(peerId: string) {
  const parts = peerId.split('-')
  if (parts.length !== 3) {
    return null
  }
  if (!roomID.test(parts[0])) {
    return null
  }
  return parts[0]
}

type Presence = {
  peerId: string
  lastSeen: number
}

const roomPresence = new Map<string, Map<string, Presence>>()
const PRESENCE_TTL_MS = 90_000

function pruneRoom(rid: string) {
  const m = roomPresence.get(rid)
  if (!m) {
    return
  }
  const now = Date.now()
  for (const [k, v] of m) {
    if (now - v.lastSeen > PRESENCE_TTL_MS) {
      m.delete(k)
    }
  }
  if (m.size === 0) {
    roomPresence.delete(rid)
  }
}

/** room id → peerId → websocket (WebRTC signaling only) */
const signalSockets = new Map<string, Map<string, WebSocket>>()

const WS_CLOSE_USERNAME_IN_USE = 4002

function wsIsClaimed(ws: WebSocket): boolean {
  return (
    ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING
  )
}

function registerSignalSocket(room: string, peerId: string, ws: WebSocket) {
  let m = signalSockets.get(room)
  if (!m) {
    m = new Map()
    signalSockets.set(room, m)
  }
  const prev = m.get(peerId)
  if (prev && prev !== ws && wsIsClaimed(prev)) {
    ws.close(WS_CLOSE_USERNAME_IN_USE, 'username_in_use')
    return
  }
  m.set(peerId, ws)
  ws.on('close', () => {
    const mm = signalSockets.get(room)
    if (mm?.get(peerId) === ws) {
      mm.delete(peerId)
    }
    if (mm && mm.size === 0) {
      signalSockets.delete(room)
    }
  })
}

type SignalClientMsg = {
  v?: unknown
  to?: unknown
  body?: unknown
}

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws, req) => {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const room = url.searchParams.get('room')
  const peerId = url.searchParams.get('peerId')
  if (!room || !peerId || peerIdRoom(peerId) !== room) {
    ws.close(4000, 'invalid room or peerId')
    return
  }
  registerSignalSocket(room, peerId, ws)
  ws.on('message', (raw) => {
    let msg: SignalClientMsg
    try {
      msg = JSON.parse(raw.toString()) as SignalClientMsg
    } catch {
      return
    }
    if (msg.v !== 2 || typeof msg.to !== 'string' || typeof msg.body !== 'object') {
      return
    }
    if (msg.body === null || Array.isArray(msg.body)) {
      return
    }
    if (peerIdRoom(msg.to) !== room) {
      return
    }
    const target = signalSockets.get(room)?.get(msg.to)
    if (target?.readyState === WebSocket.OPEN) {
      target.send(JSON.stringify({ v: 2, from: peerId, body: msg.body }))
    }
  })
})

server.on('upgrade', (request, socket, head) => {
  const host = request.headers.host ?? 'localhost'
  const path = new URL(request.url ?? '/', `http://${host}`).pathname
  if (path !== signalPathV2) {
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

const httpPort = listenPort()

app.post(v2('/room/:room/presence'), (req, res) => {
  const rid = roomParam(req.params.room)
  const body = req.body as { peerId?: string }
  if (!rid || typeof body.peerId !== 'string') {
    res.status(400).json({ error: 'bad request' })
    return
  }
  if (peerIdRoom(body.peerId) !== rid) {
    res.status(400).json({ error: 'peerId does not match room' })
    return
  }
  let m = roomPresence.get(rid)
  if (!m) {
    m = new Map()
    roomPresence.set(rid, m)
  }
  m.set(body.peerId, {
    peerId: body.peerId,
    lastSeen: Date.now(),
  })
  res.json({ ok: true })
})

app.get(v2('/room/:room/users'), (req, res) => {
  const rid = roomParam(req.params.room)
  if (!rid) {
    res.status(400).send('Invalid room')
    return
  }
  pruneRoom(rid)
  const m = roomPresence.get(rid)
  if (!m) {
    res.json([])
    return
  }
  res.json([...m.values()].map((v) => ({ id: v.peerId })))
})

app.get(v2('/default-room'), (req, res) => {
  const ip = getClientIp(req)
  const seed = ip ? subnetSeedForLanRoom(ip) : 'unknown'
  res.json({ room: roomCodeFromSeed(seed) })
})

app.use(u('/'), express.static('dist'))

const host = listenHost()
server.listen(
  {
    host,
    port: httpPort,
    exclusive: true,
  },
  () => {
    console.log(`Server is running on http://${host}:${httpPort}`)
    console.log(`WebRTC signaling WebSocket path: ${signalPathV2}`)
  }
)

server.on('error', (error) => {
  console.log('Error: ', error)
  process.exit(1)
})
