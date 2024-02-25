import { Peer, PeerOptions, LogLevel, DataConnection } from 'peerjs'
import { Username, parseName } from './room'

export type Data = {
  type: 'file' | 'text'
  name: string
  payload: string | ArrayBuffer | ArrayBufferView | Blob
}

export type Options = {
  room: string
  username: Username
  logLevel?: LogLevel
  path?: string
  hostname?: string
  port?: number
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
  user: Username
  room: string
  id: string

  constructor(options: Options) {
    this.room = options.room
    this.user = options.username
    const opt: PeerOptions = {
      debug: options.logLevel || 2, // default warning
      config: tunConfig,
    }
    options.hostname && (opt.host = options.hostname)
    options.port && (opt.port = options.port)
    if (!options.port) {
      if (window.location.port) {
        opt.port = parseInt(window.location.port)
      } else {
        opt.port = window.location.protocol === 'https:' ? 443 : 80
      }
    }
    options.path && (opt.path = options.path)
    const id = `${options.room}-${options.username.fullName}`
    console.log(
      `peer options: id=${id}, host=${opt.host}, port=${opt.port}, path=${opt.path} key=${opt.key}`
    )
    this.peer = new Peer(id, opt)
    this.id = id
  }

  onOpen(callback: (id: string) => void) {
    this.peer.on('open', callback)
  }

  onConnection(callback: (id: string, conn: Connection) => void) {
    this.peer.on('connection', (conn) => {
      callback(conn.label, new Connection(conn.label, conn))
    })
  }

  onError(callback: (err: Error) => void) {
    this.peer.on('error', (e) => {
      callback(e)
    })
  }

  connect(fullName: string) {
    const name = parseName(fullName)
    let id: string
    if (name) {
      id = this.room + '-' + fullName
    } else {
      id = fullName
    }
    const conn = this.peer.connect(id, { reliable: true, label: this.id })
    return new Connection(id, conn)
  }
}

export class Connection {
  conn: DataConnection
  id: string

  get ok() {
    return this.conn.open
  }

  constructor(id: string, conn: DataConnection) {
    this.conn = conn
    this.id = id
  }

  onOpen(callback: () => void) {
    this.conn.on('open', callback)
  }

  onClose(callback: () => void) {
    this.conn.on('close', callback)
  }

  onReceive(callback: (data: Data) => void) {
    this.conn.on('data', (data) => {
      callback(data as Data)
    })
  }

  onError(callback: (err: Error) => void) {
    this.conn.on('error', callback)
  }

  send(data: Data) {
    return this.conn.send(data)
  }
}
