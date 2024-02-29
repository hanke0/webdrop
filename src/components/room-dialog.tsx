import { CodeBox } from './codebox'
import { Dialog } from './dialog'
import { getRoomURL } from '../lib/client'
import { isGoodRoom } from '../lib/room'
import QRCode from 'react-qr-code'
import { toast } from 'react-hot-toast'
import { RefObject, useRef } from 'react'

export type RoomDialogProps = {
  room: string
  open: RefObject<HTMLElement>
  onClose?: () => void
}

export const RoomDialog = (props: RoomDialogProps) => {
  const onFull = (code: string) => {
    if (!isGoodRoom(code)) {
      toast.error('Invalid room code')
      return
    }
    window.location.replace(getRoomURL(code))
  }
  const url = useRef(getRoomURL(props.room).toString())

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <h2 className="my-2 text-2xl font-bold">Your Room</h2>
      <CodeBox
        length={6}
        onFull={onFull}
        beforeChange={(code) => code.toUpperCase()}
        defaultCode={props.room}
        validator={(input) => {
          return /^[A-Z0-9]$/.test(input)
        }}
      />
      <div
        className="text-1xl mt-4 mb-8 cursor-pointer hover:pointer text-center text-blue-500"
        onClick={() => {
          navigator.clipboard
            .writeText(url.current)
            .then(() => {
              toast.success('Room url copied to clipboard')
            })
            .catch(() => {
              toast.error('Failed to copy room url to clipboard')
            })
        }}
      >
        Click to paste or scan QR Code to share
      </div>
      <QRCode
        className="text-center mx-auto my-4 w-64 h-64"
        value={url.current}
      />
    </Dialog>
  )
}
