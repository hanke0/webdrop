import { CodeBox } from './codebox'
import { Dialog } from './dialog'
import { getRoomURL, isGoodRoom } from '../lib/room'
import QRCodeImport from 'react-qr-code'
import { toast } from 'react-hot-toast'
import { ComponentType, RefObject, SVGProps, useMemo } from 'react'

type QRCodeProps = { value: string; size?: number } & SVGProps<SVGSVGElement>

const QRCode = (
  typeof QRCodeImport === 'function'
    ? QRCodeImport
    : (QRCodeImport as { default?: ComponentType<QRCodeProps> }).default ??
      (QRCodeImport as { QRCode?: ComponentType<QRCodeProps> }).QRCode
) as ComponentType<QRCodeProps>

export type RoomDialogProps = {
  room: string
  open: RefObject<HTMLElement | null>
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
  const roomUrl = useMemo(() => getRoomURL(props.room), [props.room])

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <h2 className="text-xl font-semibold text-[var(--wd-text)] pr-8">
        房间与邀请
      </h2>
      <p className="text-sm text-[var(--wd-muted)] mt-2 mb-4 text-left leading-relaxed">
        修改下方房间码可切换房间；分享链接或二维码邀请他人加入。
      </p>
      <CodeBox
        length={6}
        onFull={onFull}
        beforeChange={(code) => code.toUpperCase()}
        defaultCode={props.room}
        validator={(input) => {
          return /^[A-Z0-9]$/.test(input)
        }}
      />
      <button
        type="button"
        className="w-full mt-6 mb-2 py-3 px-4 rounded-xl border border-[var(--wd-border)] bg-[var(--wd-surface)] text-sm text-[var(--wd-muted)] hover:bg-[var(--wd-surface-hover)] hover:text-[var(--wd-text)] transition-colors duration-200 text-center"
        onClick={() => {
          navigator.clipboard
            .writeText(roomUrl)
            .then(() => {
              toast.success('房间链接已复制', {
                icon: '📋',
                id: 'copy-room-url',
              })
            })
            .catch(() => {
              toast.error('复制链接失败', {
                icon: '📋',
                id: 'copy-room-url',
              })
            })
        }}
      >
        点击复制房间链接
      </button>
      <p className="text-xs text-[var(--wd-faint)] text-center mb-4">
        也可让对方扫描下方二维码
      </p>
      <div className="rounded-xl bg-white p-4 w-fit mx-auto shadow-inner">
        <QRCode className="w-44 h-44" value={roomUrl} />
      </div>
    </Dialog>
  )
}
