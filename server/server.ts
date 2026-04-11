import 'dotenv/config'
import express from 'express'
import morgan from 'morgan'
import helmet from 'helmet'
import { IncomingMessage, createServer } from 'http'
import { createHash } from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'

const app = express()
const server = createServer(app)

const getUserIPRoom = (req: IncomingMessage) => {
  let ip = ''
  const xReal = req.headers['x-real-ip']
  const forwarded = req.headers['x-forwarded-for']
  const fromForwarded =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : undefined
  const realIP =
    (typeof xReal === 'string' && xReal.length > 0 ? xReal : undefined) ??
    fromForwarded ??
    req.socket.remoteAddress
  if (typeof realIP === 'string' && realIP.length > 0) {
    ip = realIP
  }
  if (!ip) {
    ip = Math.random().toString(36).substring(7)
  }
  const bname = createHash('md5').update(ip).digest('base64')
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
    if (name.length == 6) {
      break
    }
  }
  while (name.length != 6) {
    name += 'Z'
  }
  return { name, ip }
}

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
  app.use(helmet())
} else {
  console.log(
    'WARNING: Development mode, set NODE_ENV=production to enable security features in production.'
  )
  app.use((_, rsp, next) => {
    rsp.header('Access-Control-Allow-Origin', '*')
    next()
  })
}
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

const u = (url: string) => {
  return _u(url, process.env.BASE_URL || '/')
}

const pu = (url: string) => {
  return _u(url, process.env.WEB_DROP_PEER_PATH || '/peer')
}

const signalPath = pu('/signal')

app.use(function (req, res, next) {
  if (req.path === u('/')) {
    const room = getUserIPRoom(req)
    res.cookie('userip', room.ip, { maxAge: 900000 })
    res.cookie('useriproom', room.name, { maxAge: 900000 })
  }
  next()
})

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

const httpPort = parseInt(process.env.PORT || '8080', 10)

app.post(pu('/api/room/:room/presence'), (req, res) => {
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

app.get(pu('/api/room/:room/users'), (req, res) => {
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

app.use(u('/'), express.static('dist'))

const host = process.env.HOSTNAME || 'localhost'
server.listen(
  {
    host: host,
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
