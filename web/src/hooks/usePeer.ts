import { useSearchParams } from './useSearchParams'
import { MutableRefObject, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import i18n from '../i18n'
import type {
  LazyConnection,
  PeerLink,
  PeerLinkCallback,
} from '../lib/webrtc'
import { LazyConnectionImpl, RoomSession } from '../lib/webrtc'
import { resolveRoomOverride, resolveSessionUser } from '../lib/room'

export function usePeer(
  addConnection: (conn: LazyConnection) => void,
  removeConnection: (conn: LazyConnection) => void,
  fileOfferRef: MutableRefObject<PeerLinkCallback['fileOffer'] | undefined>,
  chatMessageRef: MutableRefObject<PeerLinkCallback['chatMessage'] | undefined>,
  chatAckRef: MutableRefObject<PeerLinkCallback['chatAck'] | undefined>
) {
  const search = useSearchParams()
  const [peer, setPeer] = useState<RoomSession | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    let live: RoomSession | null = null
    const wrap = (conn: PeerLink) =>
      new LazyConnectionImpl(conn.id, () => conn)

    const inboundHandlers: PeerLinkCallback = {
      open: (conn) => addConnection(wrap(conn)),
      error: (conn) => removeConnection(wrap(conn)),
      close: (conn) => removeConnection(wrap(conn)),
      get fileOffer() {
        return fileOfferRef.current
      },
      get chatMessage() {
        return chatMessageRef.current
      },
      get chatAck() {
        return chatAckRef.current
      },
    }

    ;(async () => {
      try {
        const user = resolveSessionUser(search)
        const room = resolveRoomOverride(search) ?? undefined
        const instance = await RoomSession.create({ room, user }, inboundHandlers)
        if (cancelled) {
          instance.close()
          return
        }
        if (instance.err) {
          toast.error(
            i18n.t('hook.peerError', { message: instance.err.message })
          )
          setPeer(instance)
          return
        }
        live = instance
        instance.onDisconnect(() => {
          console.log('signaling disconnected:', instance.id)
          if (!cancelled) {
            setPeer(null)
            setRetryToken((token) => token + 1)
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
        toast.error(i18n.t('hook.peerError', { message: msg }))
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
  }, [
    search,
    addConnection,
    removeConnection,
    fileOfferRef,
    chatMessageRef,
    chatAckRef,
    retryToken,
  ])

  return peer
}
