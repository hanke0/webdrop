import 'dotenv/config'
import express from 'express'
import { ExpressPeerServer } from 'peer'
import morgan from 'morgan'
import helmet from 'helmet'
import { IncomingMessage, createServer } from 'http'
import { createHash } from 'crypto'

const app = express()
const server = createServer(app)

const getUserIPRoom = (req: IncomingMessage) => {
  let ip = ''
  let realIP = req.headers['X-Real-IP']
  if (!realIP) {
    const forwarded = req.headers['x-forwarded-for']
    realIP =
      typeof forwarded === 'string'
        ? forwarded.split(/, /)[0]
        : req.socket.remoteAddress
  }
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
  console.log('WARNING: Development mode, set NOE_ENV=production to enable security features in production.')
  app.use((_, rsp, next) => {
    rsp.header('Access-Control-Allow-Origin', '*')
    next()
  })
}
app.use(morgan('short'))

const cleanPath = (path: string) => {
  const end = path.endsWith('/') ? path.length - 1 : path.length
  const start = path.startsWith('/') ? 1 : 0
  return path.slice(start, end)
}

const _u = (url: string, prefix: string) => {
  if (url == "/" || !url) {
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

app.use(function (req, res, next) {
  if (req.path === u('/')) {
    const room = getUserIPRoom(req)
    res.cookie('userip', room.ip, { maxAge: 900000 })
    res.cookie('useriproom', room.name, { maxAge: 900000 })
  }
  next()
})

const peerServer = ExpressPeerServer(server, {
  path: pu('/'),
  proxied: true,
})

type User = {
  id: string
}

const rooms = new Map<string, User[]>()

const roomID = /^[A-Z0-9]{6}$/

function getRoom(id: string) {
  const parts = id.split('-')
  if (parts.length !== 3) {
    return null
  }
  if (!roomID.test(parts[0])) {
    return null
  }
  return parts[0]
}

peerServer.on('connection', (client) => {
  const id = client.getId()
  console.log('connected: ', id)
  const rid = getRoom(client.getId())
  if (!rid) {
    client.send({ type: 'ERROR', payload: 'Invalid room' })
    return
  }
  const room = rooms.get(rid)
  if (!room) {
    rooms.set(rid, [{ id: id }])
    console.log('room created: ', id)
    return
  }
  const user = room.find((u) => u.id === id)
  if (!user) {
    room.push({ id: id })
    console.log('user joined: ', id)
    return
  }
})

peerServer.on('disconnect', (client) => {
  const id = client.getId()
  console.log('disconnect: ', id)
  const rid = getRoom(client.getId())
  if (rid) {
    const room = rooms.get(rid)
    if (room) {
      const index = room.findIndex((u) => u.id === id)
      if (index >= 0) {
        room.splice(index, 1)
        console.log('user left: ', id)
      }
      if (room.length === 0) {
        rooms.delete(rid)
        console.log('room deleted: ', rid)
      }
    }
  }
})

peerServer.on('error', (error) => {
  console.log('peerServer error: ', error)
})



app.use(u('/'), peerServer)
app.use(u('/'), express.static('dist'))
app.use(pu('/api/room/:room/users'), (req, res) => {
  const rid = req.params.room
  if (!rid) {
    res.status(400).send('Invalid room')
    return
  }
  const room = rooms.get(rid)
  if (!room) {
    res.json([])
    return
  }
  res.json(room)
})

const port = process.env.PORT || '8080'
const host = process.env.HOSTNAME || 'localhost'
server.listen(
  {
    host: host,
    port: port,
    exclusive: true,
  },
  () => {
    console.log(`Server is running on http://${host}:${port}`)
  }
)

server.on('error', (error) => {
  console.log('Error: ', error)
  process.exit(1)
})
