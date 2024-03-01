import { getLocalRoom, getRoomAndUser } from '../lib/client'
import { LazyConnection, P2P } from '../lib/p2p'
import { isGoodRoom, isGoodUser, randomRoom, randomUser } from '../lib/room'
import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

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
    const p = peer
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
      open: addConnection,
      error: removeConnection,
      close: removeConnection,
    })
    return () => {
      if (p && !p.ok) {
        p.close()
        setPeer(null)
      }
    }
  }, [peer, addConnection, removeConnection])
  return peer
}