import 'dotenv/config'
import express from 'express'
import morgan from 'morgan'
import helmet from 'helmet'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import {
  getClientIp,
  roomCodeFromSeed,
  subnetSeedForLanRoom,
} from './ipSubnet'

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
const API_V1_PREFIX = '/api/v1'

const u = (url: string) => {
  return _u(url, STATIC_PREFIX)
}

const v1 = (url: string) => {
  return _u(url, API_V1_PREFIX)
}

const signalPath = v1('/signal')

const roomID = /^[A-Z0-9]{6}$/

function roomParam(
  p: string | string[] | undefined
): string | undefined {
  if (p == null) {
    return undefined
  }
  return Array.isArray(p) ? p[0] : p
}

function logicalIdRoom(id: string) {
  const parts = id.split('-')
  if (parts.length !== 3) {
    return null
  }
  if (!roomID.test(parts[0])) {
    return null
  }
  return parts[0]
}

type Presence = {
  logicalId: string
  addrs: string[]
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

/** room id → logical id → websocket (WebRTC signaling only, not a libp2p relay) */
const signalSockets = new Map<string, Map<string, WebSocket>>()

function registerSignalSocket(
  room: string,
  logicalId: string,
  ws: WebSocket
) {
  let m = signalSockets.get(room)
  if (!m) {
    m = new Map()
    signalSockets.set(room, m)
  }
  const prev = m.get(logicalId)
  if (prev && prev !== ws && prev.readyState === WebSocket.OPEN) {
    prev.close(4001, 'replaced')
  }
  m.set(logicalId, ws)
  ws.on('close', () => {
    const mm = signalSockets.get(room)
    if (mm?.get(logicalId) === ws) {
      mm.delete(logicalId)
    }
    if (mm && mm.size === 0) {
      signalSockets.delete(room)
    }
  })
}

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws, req) => {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const room = url.searchParams.get('room')
  const logicalId = url.searchParams.get('logicalId')
  if (!room || !logicalId || logicalIdRoom(logicalId) !== room) {
    ws.close(4000, 'invalid room or logicalId')
    return
  }
  registerSignalSocket(room, logicalId, ws)
  ws.on('message', (raw) => {
    let msg: { to?: string; payload?: unknown }
    try {
      msg = JSON.parse(raw.toString()) as { to?: string; payload?: unknown }
    } catch {
      return
    }
    if (typeof msg.to !== 'string' || msg.payload === undefined) {
      return
    }
    if (logicalIdRoom(msg.to) !== room) {
      return
    }
    const target = signalSockets.get(room)?.get(msg.to)
    if (target?.readyState === WebSocket.OPEN) {
      target.send(JSON.stringify({ from: logicalId, payload: msg.payload }))
    }
  })
})

server.on('upgrade', (request, socket, head) => {
  const host = request.headers.host ?? 'localhost'
  const path = new URL(request.url ?? '/', `http://${host}`).pathname
  if (path !== signalPath) {
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
  const n = parseInt(raw && raw.length > 0 ? raw : '8080', 10)
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : 8080
}

const httpPort = listenPort()

app.post(v1('/room/:room/presence'), (req, res) => {
  const rid = roomParam(req.params.room)
  const body = req.body as { logicalId?: string; addrs?: unknown }
  if (!rid || typeof body.logicalId !== 'string' || !Array.isArray(body.addrs)) {
    res.status(400).json({ error: 'bad request' })
    return
  }
  if (!body.addrs.every((a) => typeof a === 'string')) {
    res.status(400).json({ error: 'addrs must be strings' })
    return
  }
  if (logicalIdRoom(body.logicalId) !== rid) {
    res.status(400).json({ error: 'logicalId does not match room' })
    return
  }
  let m = roomPresence.get(rid)
  if (!m) {
    m = new Map()
    roomPresence.set(rid, m)
  }
  m.set(body.logicalId, {
    logicalId: body.logicalId,
    addrs: body.addrs as string[],
    lastSeen: Date.now(),
  })
  res.json({ ok: true })
})

app.get(v1('/room/:room/users'), (req, res) => {
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
  res.json(
    [...m.values()].map((v) => ({
      id: v.logicalId,
      addrs: v.addrs,
    }))
  )
})

/** Default room for this LAN segment (IPv4 private /24, etc.); used when SPA has no stored room. */
app.get(v1('/default-room'), (req, res) => {
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
    console.log(`WebRTC signaling WebSocket path: ${signalPath}`)
  }
)

server.on('error', (error) => {
  console.log('Error: ', error)
  process.exit(1)
})
