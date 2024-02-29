import { isGoodUser, splitRoomAndUser } from './room'
import config from '../lib/config'
import { DataConnection, LogLevel, Peer, PeerOptions } from 'peerjs'
import toast from 'react-hot-toast'
import fileDownload from 'js-file-download'

export type Data = {
  type: 'file' | 'text'
  name: string
  payload: string | ArrayBuffer | ArrayBufferView | Blob
}

export type Options = {
  room: string
  user: string
  logLevel?: LogLevel
}

const tunConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // { urls: "stun:stun.qq.com:3478" },
    // { urls: "stun:stun.miwifi.com:3478" },
    // { urls: "stun:stun.nextcloud.com:443" },
    {
      urls: [
        'turn:eu-0.turn.peerjs.com:3478',
        'turn:us-0.turn.peerjs.com:3478',
      ],
      username: 'peerjs',
      credential: 'peerjsp',
    },
  ],
  sdpSemantics: 'unified-plan',
}

export interface P2PError {
  type: string
  err: string | Error
}

export class P2P {
  peer: Peer
  user: string
  room: string
  id: string
  err?: Error

  constructor(options: Options) {
    console.log(config)
    this.room = options.room
    this.user = options.user
    const opt: PeerOptions = {
      debug: options.logLevel || 2, // default warning
      config: tunConfig,
    }
    config.PEER_HOSTNAME && (opt.host = config.PEER_HOSTNAME)
    config.PEER_PORT && (opt.port = config.PEER_PORT)
    if (opt.host && !config.PEER_PORT) {
      if (window.location.port) {
        opt.port = parseInt(window.location.port)
      } else {
        opt.port = window.location.protocol === 'https:' ? 443 : 80
      }
    }
    config.PEER_PATH && (opt.path = config.PEER_PATH)

    const id = `${options.room}-${options.user}`
    console.log(
      `peer is opening: id=${id}, host=${opt.host}, port=${opt.port}, path=${opt.path}`
    )
    if (!opt.host) {
      this.peer = new Peer(opt)
    } else {
      this.peer = new Peer(id, opt)
    }
    this.id = id
  }

  close() {
    console.log('peer is closing: ', this.id)
    this.peer.disconnect()
    this.peer.destroy()
  }

  onOpen(callback: (id: string) => void) {
    this.peer.on('open', (id) => {
      this.id = id
      const [room, user] = splitRoomAndUser(id)
      if (room && user) {
        this.room = room
        this.user = user
      } else {
        this.room = ''
        this.user = id
      }
      callback(id)
    })
  }

  onDisconnect(callback: () => void) {
    this.peer.on('disconnected', () => {
      console.log('peer is disconnected:', this.id)
      callback()
    })
  }

  onClose(callback: () => void) {
    this.peer.on('close', () => {
      console.log('peer is closed:', this.id)
      callback()
    })
  }

  onConnection(callback: ConnectionCallback) {
    this.peer.on('connection', (conn) => {
      const c = new Connection(conn.peer, conn, callback)
      if (callback.knock) {
        callback.knock(c)
      }
    })
  }

  onError(callback: (err: Error) => void) {
    this.peer.on('error', (e) => {
      console.log('peer error:', this.id, e)
      callback(e)
      this.err = e
    })
  }

  connect(fullName: string, callback: ConnectionCallback) {
    let id: string
    if (isGoodUser(fullName)) {
      id = this.room + '-' + fullName
    } else {
      id = fullName
    }
    if (id === this.id) {
      toast.error('connect to self')
      return
    }
    console.log('make new connection:', this.id, id)
    const conn = this.peer.connect(id, { reliable: true, label: this.id })
    return new Connection(id, conn, callback)
  }
}

type ConnectionCallback = {
  // called when a new connection is passive established
  knock?: (conn: Connection) => void
  open: (conn: Connection) => void
  close: (conn: Connection) => void
  error: (conn: Connection, err: Error) => void
}

export interface LazyConnection {
  getReal: (peer: P2P) => Connection
  id: string
}

export class LazyConnectionImpl implements LazyConnection {
  id: string
  buildConn: (peer: P2P) => Connection
  conn?: Connection

  constructor(id: string, buildConn: (peer: P2P) => Connection) {
    this.id = id
    this.buildConn = buildConn
  }

  getReal(peer: P2P) {
    if (this.conn) {
      return this.conn
    }
    this.conn = this.buildConn(peer)
    return this.conn
  }
}

export class Connection implements LazyConnection {
  conn: DataConnection
  id: string
  err?: Error
  closed?: boolean
  opened?: boolean

  get ok() {
    return !this.err && !this.closed
  }

  getReal() {
    return this
  }

  get user() {
    const [, user] = splitRoomAndUser(this.id)
    if (user) {
      return user
    }
    return this.id
  }

  constructor(id: string, conn: DataConnection, callback: ConnectionCallback) {
    this.conn = conn
    this.id = id
    conn.on('open', () => {
      console.log('connection open:', id)
      this.opened = true
      callback.open(this)
    })
    conn.on('close', () => {
      console.log('connection close:', id)
      this.closed = true
      this.opened = false
      callback.close(this)
    })
    conn.on('error', (err) => {
      console.log('connection error:', id, err)
      this.err = err
      this.closed = true
      this.opened = false
      callback.error(this, err)
    })
    conn.on('data', (payload) => {
      console.log('receive data from :', this.id)
      const data = payload as Data
      console.log('peer receive data:', this.id, data.type, data.name)
      if (data.type !== 'file') {
        toast(`receive message from ${data.name}: ${data.payload}`)
        return
      }
      toast(`receive file ${data.name}`)
      fileDownload(data.payload, data.name)
    })
  }

  send(data: Data) {
    if (!this.conn.open) {
      toast.error(`connection to ${this.id} is not open`)
      console.log('send data to not opened connection:', this.id)
      return
    }
    console.log('send data to:', this.id)
    return this.conn.send(data)
  }

  close() {
    this.conn.close()
    this.closed = true
    this.opened = false
  }
}
