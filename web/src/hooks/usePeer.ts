import { useSearchParams } from './useSearchParams'
import { useCookies } from './useCookies'
import { ConnectionCallback, LazyConnection, P2P } from '../lib/p2p'
import { isGoodRoom, isGoodUser, randomRoom, randomUser } from '../lib/room'
import { MutableRefObject, useEffect, useState } from 'react'
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
  removeConnection: (conn: LazyConnection) => void,
  fileOfferRef: MutableRefObject<ConnectionCallback['fileOffer'] | undefined>
) {
  const cookies = useCookies()
  const search = useSearchParams()
  const [peer, setPeer] = useState<P2P | null>(null)

  useEffect(() => {
    let cancelled = false
    let live: P2P | null = null
    const room = getRoom(search, cookies)
    const user = getUser(search)

    const inboundHandlers: ConnectionCallback = {
      open: addConnection,
      error: removeConnection,
      close: removeConnection,
      get fileOffer() {
        return fileOfferRef.current
      },
    }

    ;(async () => {
      try {
        const instance = await P2P.create({ room, user }, inboundHandlers)
        if (cancelled) {
          instance.close()
          return
        }
        if (instance.err) {
          toast.error(`peer error: ${instance.err.message}`)
          setPeer(null)
          return
        }
        live = instance
        instance.onDisconnect(() => {
          console.log('signaling disconnected:', instance.id)
          if (!cancelled) {
            setPeer(null)
          }
        })
        instance.onClose(() => {
          if (!cancelled) {
            setPeer(null)
          }
        })
        setPeer(instance)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error(`peer error: ${msg}`)
        if (!cancelled) {
          setPeer(null)
        }
      }
    })()

    return () => {
      cancelled = true
      live?.close()
      setPeer(null)
    }
  }, [cookies, search, addConnection, removeConnection])

  return peer
}
