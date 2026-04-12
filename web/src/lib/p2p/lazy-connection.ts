import type { Connection } from './connection'
import type { P2P } from './p2p-coordinator'

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
