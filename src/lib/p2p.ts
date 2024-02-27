import { DataConnection, LogLevel, Peer, PeerOptions } from 'peerjs'
import { splitRoomAndUser, isGoodUser } from './room'
import config from '../lib/config'

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
    if (!opt.host) {
      this.peer = new Peer(opt)
    } else {
      console.log(
        `peer options: id=${id}, host=${opt.host}, port=${opt.port}, path=${opt.path}`
      )
      this.peer = new Peer(id, opt)
    }
    this.id = id
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
    let id: string
    if (isGoodUser(fullName)) {
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
  err?: Error

  get ok() {
    return !this.err && this.conn.open
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
    this.conn.on('error', (err) => {
      this.err = err
      callback(err)
    })
  }

  send(data: Data) {
    return this.conn.send(data)
  }
}
