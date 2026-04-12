import { useSearchParams } from './useSearchParams'
import { ConnectionCallback, LazyConnection, P2P } from '../lib/p2p'
import { resolveSessionRoom, resolveSessionUser } from '../lib/room'
import { MutableRefObject, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

export function usePeer(
  addConnection: (conn: LazyConnection) => void,
  removeConnection: (conn: LazyConnection) => void,
  fileOfferRef: MutableRefObject<ConnectionCallback['fileOffer'] | undefined>,
  chatInviteRef: MutableRefObject<ConnectionCallback['chatInvite'] | undefined>,
  chatMessageRef: MutableRefObject<ConnectionCallback['chatMessage'] | undefined>
) {
  const search = useSearchParams()
  const [peer, setPeer] = useState<P2P | null>(null)

  useEffect(() => {
    let cancelled = false
    let live: P2P | null = null
    const inboundHandlers: ConnectionCallback = {
      open: addConnection,
      error: removeConnection,
      close: removeConnection,
      get fileOffer() {
        return fileOfferRef.current
      },
      get chatInvite() {
        return chatInviteRef.current
      },
      get chatMessage() {
        return chatMessageRef.current
      },
    }

    ;(async () => {
      try {
        const room = await resolveSessionRoom(search)
        if (cancelled) {
          return
        }
        const user = resolveSessionUser(search)
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
  }, [search, addConnection, removeConnection, chatInviteRef, chatMessageRef])

  return peer
}
