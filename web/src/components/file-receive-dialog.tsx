import { Dialog, OpenState } from './dialog'
import { Button } from './button'
import { getUserShowName } from '../lib/room'
import { useEffect, useRef } from 'react'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

export type IncomingFileOffer = {
  transferId: string
  uid: string
  name: string
  size: number
  respond: (accepted: boolean) => void
}

export type FileReceiveDialogProps = {
  offer: IncomingFileOffer | null
  onClose: () => void
  open: OpenState
}

export function FileReceiveDialog(props: FileReceiveDialogProps) {
  const offer = props.offer
  const from = offer ? getUserShowName(offer.uid) : ''
  const doneRef = useRef(false)

  useEffect(() => {
    doneRef.current = false
  }, [offer?.transferId])

  const finish = (accepted: boolean) => {
    if (doneRef.current || !offer) {
      return
    }
    doneRef.current = true
    offer.respond(accepted)
    props.onClose()
  }

  return (
    <Dialog open={props.open} onClose={() => finish(false)}>
      <h3 className="text-lg font-semibold text-[var(--wd-text)] pr-8">
        收到文件
      </h3>
      {offer && (
        <>
          <p className="text-sm text-[var(--wd-muted)] py-2">
            来自 <span className="text-[var(--wd-text)]">{from}</span>
          </p>
          <p className="text-[var(--wd-text)] py-2 break-all text-left">
            <span className="text-[var(--wd-accent)] font-medium">
              {offer.name}
            </span>
            <span className="text-[var(--wd-muted)] text-sm block mt-2">
              {formatBytes(offer.size)}
            </span>
          </p>
          <p className="text-xs text-[var(--wd-muted)] py-2 leading-relaxed">
            接受后文件将下载到你的设备。
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
