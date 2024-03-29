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
  id: string
  err?: Error
  closed?: boolean

  get ok() {
    return !this.err && !this.closed
  }

  get room() {
    const [room] = splitRoomAndUser(this.id)
    return room || ''
  }

  get user() {
    const [, user] = splitRoomAndUser(this.id)
    return user || this.id
  }

  constructor(options: Options) {
    console.log(config)
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
    this.closed = true
    this.peer.disconnect()
    this.peer.destroy()
  }

  onOpen(callback: (id: string) => void) {
    this.peer.on('open', (id) => {
      this.id = id
      callback(id)
    })
  }

  onDisconnect(callback: () => void) {
    this.peer.on('disconnected', () => {
      console.log('peer is disconnected:', this.id)
      this.closed = true
      callback()
    })
  }

  onClose(callback: () => void) {
    this.peer.on('close', () => {
      console.log('peer is closed:', this.id)
      this.closed = true
      callback()
    })
  }

  onConnection(callback: ConnectionCallback) {
    this.peer.on('connection', (conn) => {
      console.log('new connection from:', conn.peer)
      const c = new Connection(conn.peer, conn, callback)
      if (callback.knock) {
        callback.knock(c)
      }
    })
  }

  onError(callback: (err: Error) => void) {
    this.peer.on('error', (e) => {
      console.log('peer error:', this.id, e)
      this.err = e
      this.closed = true
      callback(e)
    })
  }

  getConnectID(user: string) {
    if (isGoodUser(user)) {
      return this.room + '-' + user
    }
    const maybe = user.toLowerCase().replace(' ', '-')
    if (isGoodUser(maybe)) {
      return this.room + "-" + maybe
    }
    return user
  }

  isSelf(id: string) {
    return this.getConnectID(id) === this.id
  }

  connect(fullName: string, callback: ConnectionCallback) {
    const id = this.getConnectID(fullName)
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
      const data = payload as Data
      console.log('receive data:', this.id, data.type, data.name)
      if (data.type !== 'file') {
        toast(`receive message from ${data.name}: ${data.payload}`)
        return
      }
      toast(`receive file ${data.name}`, { icon: '📁', })
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
