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
      <h3 className="py-2 px-1 text-lg font-semibold">Incoming file</h3>
      {offer && (
        <>
          <p className="text-gray-600 text-sm py-1">From: {from}</p>
          <p className="text-gray-800 py-2 break-all">
            <span className="text-blue-600">{offer.name}</span>
            <span className="text-gray-500 text-sm block mt-1">
              {formatBytes(offer.size)}
            </span>
          </p>
          <p className="text-gray-500 text-xs py-2">
            Accept to download this file to your device.
          </p>
        </>
      )}
      <div className="flex flex-col gap-2 pt-2">
        <Button handleClick={() => finish(true)}>Accept</Button>
        <Button handleClick={() => finish(false)}>Decline</Button>
      </div>
    </Dialog>
  )
}
