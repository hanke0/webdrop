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
    let cancelled = false
    const room = getRoom(search, cookies)
    const user = getUser(search)
    const instance = new P2P({
      room,
      user,
    })
    instance.onOpen(() => {
      if (!cancelled) {
        setPeer(instance)
      }
    })
    instance.onError((err) => {
      toast.error(`peer error: ${err.message}`)
      if (!cancelled) {
        setPeer(null)
      }
    })
    instance.onDisconnect(() => {
      if (!cancelled) {
        setPeer(null)
      }
    })
    instance.onClose(() => {
      if (!cancelled) {
        setPeer(null)
      }
    })
    instance.onConnection({
      open: addConnection,
      error: removeConnection,
      close: removeConnection,
    })
    return () => {
      cancelled = true
      instance.close()
      setPeer(null)
    }
  }, [cookies, search, addConnection, removeConnection])
  return peer
}
