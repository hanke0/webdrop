import { isGoodUser, splitRoomAndUser } from './room'
import config from '../lib/config'
import { DataConnection, LogLevel, Peer, PeerOptions } from 'peerjs'
import toast from 'react-hot-toast'
import fileDownload from 'js-file-download'

/** P2P wire messages (discriminated by `type`). */
export type WireData =
  | { type: 'text'; name: string; payload: string }
  | {
      type: 'file-offer'
      transferId: string
      name: string
      size: number
    }
  | {
      type: 'file-offer-response'
      transferId: string
      accepted: boolean
    }
  | { type: 'file'; transferId: string; name: string; payload: Blob }

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
    const opt: PeerOptions = {
      debug: options.logLevel || 2, // default warning
      config: tunConfig,
    }
    if (config.PEER_HOSTNAME) opt.host = config.PEER_HOSTNAME
    if (config.PEER_PORT) opt.port = config.PEER_PORT
    if (opt.host && !config.PEER_PORT) {
      if (window.location.port) {
        opt.port = parseInt(window.location.port)
      } else {
        opt.port = window.location.protocol === 'https:' ? 443 : 80
      }
    }
    if (config.PEER_PATH) opt.path = config.PEER_PATH

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
      return this.room + '-' + maybe
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

export type FileOfferMeta = {
  transferId: string
  name: string
  size: number
}

export type ConnectionCallback = {
  knock?: (conn: Connection) => void
  open: (conn: Connection) => void
  close: (conn: Connection) => void
  error: (conn: Connection, err: Error) => void
  /** Receiver: show consent UI; call `respond` with true to accept the file. */
  fileOffer?: (
    conn: Connection,
    meta: FileOfferMeta,
    respond: (accepted: boolean) => void
  ) => void
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
  private pendingOfferResponses = new Map<
    string,
    {
      resolve: (accepted: boolean) => void
      promiseReject: (err: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

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
      this.clearPendingOffers(new Error('Connection closed'))
      this.closed = true
      this.opened = false
      callback.close(this)
    })
    conn.on('error', (err) => {
      console.log('connection error:', id, err)
      this.clearPendingOffers(
        err instanceof Error ? err : new Error(String(err))
      )
      this.err = err
      this.closed = true
      this.opened = false
      callback.error(this, err)
    })
    conn.on('data', (payload) => {
      const data = payload as WireData
      console.log('receive data:', this.id, data.type, 'name' in data ? data.name : '')
      if (data.type === 'text') {
        toast(`receive message from ${data.name}: ${data.payload}`)
        return
      }
      if (data.type === 'file-offer-response') {
        const pending = this.pendingOfferResponses.get(data.transferId)
        if (pending) {
          clearTimeout(pending.timer)
          this.pendingOfferResponses.delete(data.transferId)
          pending.resolve(data.accepted)
        }
        return
      }
      if (data.type === 'file-offer') {
        const meta: FileOfferMeta = {
          transferId: data.transferId,
          name: data.name,
          size: data.size,
        }
        const respond = (accepted: boolean) => {
          this.send({
            type: 'file-offer-response',
            transferId: data.transferId,
            accepted,
          })
        }
        callback.fileOffer?.(this, meta, respond)
        return
      }
      if (data.type === 'file') {
        toast(`receive file ${data.name}`, { icon: '📁' })
        fileDownload(data.payload, data.name)
        return
      }
    })
  }

  private clearPendingOffers(err: Error) {
    for (const [tid, p] of [...this.pendingOfferResponses.entries()]) {
      clearTimeout(p.timer)
      this.pendingOfferResponses.delete(tid)
      p.promiseReject(err)
    }
  }

  /**
   * Ask the peer to accept the transfer; only sends bytes after they agree.
   */
  async sendFileWithConsent(file: File, timeoutMs = 300_000): Promise<void> {
    if (!this.conn.open) {
      toast.error(`connection to ${this.id} is not open`)
      throw new Error('connection not open')
    }
    const transferId = crypto.randomUUID()
    const accepted = await new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        const p = this.pendingOfferResponses.get(transferId)
        if (p) {
          clearTimeout(p.timer)
          this.pendingOfferResponses.delete(transferId)
          p.promiseReject(new Error('Timed out waiting for receiver'))
        }
      }, timeoutMs)
      this.pendingOfferResponses.set(transferId, {
        resolve,
        promiseReject: reject,
        timer,
      })
      this.conn.send({
        type: 'file-offer',
        transferId,
        name: file.name,
        size: file.size,
      })
    })
    if (!accepted) {
      throw new Error('Receiver declined the transfer')
    }
    const blob = new Blob([file], { type: file.type })
    const msg: WireData = {
      type: 'file',
      transferId,
      name: file.name,
      payload: blob,
    }
    await this.conn.send(msg)
  }

  send(data: WireData) {
    if (!this.conn.open) {
      toast.error(`connection to ${this.id} is not open`)
      console.log('send data to not opened connection:', this.id)
      return
    }
    console.log('send data to:', this.id)
    return this.conn.send(data)
  }

  close() {
    this.clearPendingOffers(new Error('Connection closed'))
    this.conn.close()
    this.closed = true
    this.opened = false
  }
}
