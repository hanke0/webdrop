import { useSearchParams } from './useSearchParams'
import { useCookies } from './useCookies'
import { LazyConnection, P2P } from '../lib/p2p'
import { isGoodRoom, isGoodUser, randomRoom, randomUser } from '../lib/room'
import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

const getRoom = (search: URLSearchParams, cookies: Map<string, string>) => {
  const rid = search.get('room')
  if (rid && isGoodRoom(rid)) {
    return rid
  }
  const rid1 = cookies.get('useriproom')
  if (rid1 && isGoodRoom(rid1)) {
    return rid1
  }
  return randomRoom()
}

const getUser = (search: URLSearchParams) => {
  const uid = search.get('user')
  if (uid && isGoodUser(uid)) {
    return uid
  }
  return randomUser()
}

export function usePeer(
  addConnection: (conn: LazyConnection) => void,
  removeConnection: (conn: LazyConnection) => void
) {
  const cookies = useCookies()
  const search = useSearchParams()
  const [peer, setPeer] = useState<P2P | null>(null)

  useEffect(() => {
    const p = peer
    if (peer) {
      return
    }
    const room = getRoom(search, cookies)
    const user = getUser(search)

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
  }, [cookies, search, peer, addConnection, removeConnection])
  return peer
}