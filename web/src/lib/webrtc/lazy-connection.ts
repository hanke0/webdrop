import type { PeerLink } from './peer-link'
import type { RoomSession } from './room-session'

export interface LazyConnection {
  getReal: (peer: RoomSession) => PeerLink
  id: string
}

export class LazyConnectionImpl implements LazyConnection {
  id: string
  buildConn: (peer: RoomSession) => PeerLink
  conn?: PeerLink

  constructor(id: string, buildConn: (peer: RoomSession) => PeerLink) {
    this.id = id
    this.buildConn = buildConn
  }

  getReal(peer: RoomSession) {
    if (this.conn) {
      return this.conn
    }
    this.conn = this.buildConn(peer)
    return this.conn
  }
}
