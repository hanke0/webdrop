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
      <h3 className="text-lg font-semibold text-[var(--wd-text)] pr-8">
        聊天邀请
      </h3>
      {offer && (
        <>
          <p className="text-sm text-[var(--wd-muted)] py-2">
            来自 <span className="text-[var(--wd-text)]">{from}</span>
          </p>
          <p className="text-xs text-[var(--wd-muted)] py-2 text-left leading-relaxed">
            接受后可通过当前连接与对方文字聊天。
          </p>
        </>
      )}
      <div className="flex flex-col gap-2 pt-3">
        <Button variant="primary" className="w-full" handleClick={() => finish(true)}>
          接受
        </Button>
        <Button variant="ghost" className="w-full" handleClick={() => finish(false)}>
          拒绝
        </Button>
      </div>
    </Dialog>
  )
}
