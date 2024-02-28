import { getRoomAndUser, getLocalRoom } from '../lib/client'
import { useEffect, useState } from 'react'
import { P2P, LazyConnection } from '../lib/p2p'
import { toast } from 'react-hot-toast'

import { randomUser, randomRoom, isGoodRoom, isGoodUser } from '../lib/room'

const getRoom = (rid: string) => {
  if (rid && isGoodRoom(rid)) {
    return rid
  }
  const crid = getLocalRoom()
  if (crid && isGoodRoom(crid)) {
    return crid
  }
  return randomRoom()
}

const getUser = (uid: string) => {
  if (uid && isGoodUser(uid)) {
    return uid
  }
  return randomUser()
}

export function usePeer(
  addConnection: (conn: LazyConnection) => void,
  removeConnection: (conn: LazyConnection) => void
) {
  const [peer, setPeer] = useState<P2P | null>(null)

  useEffect(() => {
    if (peer) {
      return
    }
    const [rid, uid] = getRoomAndUser()
    const room = getRoom(rid)
    const user = getUser(uid)

    const newPeer = new P2P({
      room,
      user,
    })
    newPeer.onOpen(() => {
      setPeer(newPeer)
    })
    newPeer.onError((err) => {
      toast.error(`peer error: ${err.message}`)
      setPeer(null)
    })
    newPeer.onDisconnect(() => {
      setPeer(null)
    })
    newPeer.onClose(() => {
      setPeer(null)
    })
    newPeer.onConnection({
      open: (conn) => {
        console.log('peer connection open:', conn.id)
        addConnection(conn)
      },
      error: (conn, err) => {
        console.log('peer connection error:', conn.id, err)
        removeConnection(conn)
      },
      close: (conn) => {
        console.log('peer connection close:', conn.id)
        removeConnection(conn)
      },
    })
  }, [peer, addConnection, removeConnection])
  return peer
}
