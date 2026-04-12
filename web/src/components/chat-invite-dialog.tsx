import { Dialog, OpenState } from './dialog'
import { Button } from './button'
import { getUserShowName } from '../lib/room'
import { useEffect, useRef } from 'react'

export type IncomingChatInvite = {
  inviteId: string
  uid: string
  respond: (accepted: boolean) => void
}

export type ChatInviteDialogProps = {
  offer: IncomingChatInvite | null
  /** Called once after `respond` runs; parent should clear `offer` state. */
  onResolved: (accepted: boolean, offer: IncomingChatInvite) => void
  open: OpenState
}

export function ChatInviteDialog(props: ChatInviteDialogProps) {
  const offer = props.offer
  const from = offer ? getUserShowName(offer.uid) : ''
  const doneRef = useRef(false)

  useEffect(() => {
    doneRef.current = false
  }, [offer?.inviteId])

  const finish = (accepted: boolean) => {
    if (doneRef.current || !offer) {
      return
    }
    doneRef.current = true
    offer.respond(accepted)
    props.onResolved(accepted, offer)
  }

  return (
    <Dialog open={props.open} onClose={() => finish(false)}>
      <h3 className="py-2 px-1 text-lg font-semibold">文字聊天邀请</h3>
      {offer && (
        <>
          <p className="text-gray-600 text-sm py-1">来自：{from}</p>
          <p className="text-gray-500 text-xs py-2 text-left">
            接受后双方可以通过当前连接持续发送文字消息。
          </p>
        </>
      )}
      <div className="flex flex-col gap-2 pt-2">
        <Button handleClick={() => finish(true)}>接受</Button>
        <Button handleClick={() => finish(false)}>拒绝</Button>
      </div>
    </Dialog>
  )
}
