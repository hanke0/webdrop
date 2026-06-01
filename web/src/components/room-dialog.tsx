import { Dialog } from './dialog'
import { Button } from './button'
import {
  getRoomURL,
  isGoodRoom,
  normalizeRoomCode,
} from '../lib/room'
import { copyText } from '../lib/clipboard'
import QRCodeImport from 'react-qr-code'
import { toast } from 'react-hot-toast'
import {
  ComponentType,
  RefObject,
  SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

type QRCodeProps = { value: string; size?: number } & SVGProps<SVGSVGElement>

const QRCode = (
  typeof QRCodeImport === 'function'
    ? QRCodeImport
    : (QRCodeImport as { default?: ComponentType<QRCodeProps> }).default ??
      (QRCodeImport as { QRCode?: ComponentType<QRCodeProps> }).QRCode
) as ComponentType<QRCodeProps>

const roomInputClass =
  'w-full rounded-xl border border-[var(--wd-border-strong)] bg-[var(--wd-input-bg)] px-4 py-3.5 text-center font-mono text-xl sm:text-2xl font-semibold tracking-[0.28em] uppercase text-[var(--wd-text)] placeholder:text-[var(--wd-faint)] placeholder:tracking-normal placeholder:font-normal placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-[var(--wd-accent-glow)] focus:border-[var(--wd-accent)] transition-[border-color,box-shadow] duration-200 touch-manipulation'

export type RoomDialogProps = {
  room: string
  open: RefObject<HTMLElement | null>
  onClose?: () => void
}

export const RoomDialog = (props: RoomDialogProps) => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(props.room)
  const roomUrl = useMemo(() => getRoomURL(props.room), [props.room])
  const draftUrl = useMemo(
    () => (isGoodRoom(draft) ? getRoomURL(draft) : ''),
    [draft]
  )

  useEffect(() => {
    setDraft(props.room)
  }, [props.room])

  useEffect(() => {
    const el = props.open.current
    if (!el) {
      return
    }
    const reset = () => setDraft(props.room)
    el.addEventListener('click', reset)
    return () => el.removeEventListener('click', reset)
  }, [props.open, props.room])

  const copyWithToast = useCallback(
    async (text: string, successKey: 'room.copySuccess' | 'room.copyCodeSuccess') => {
      try {
        await copyText(text)
        toast.success(t(successKey), { icon: '📋' })
      } catch {
        toast.error(t('room.copyFail'), { icon: '📋' })
      }
    },
    [t]
  )

  const joinRoom = useCallback(() => {
    const code = draft
    if (!isGoodRoom(code)) {
      toast.error(t('room.invalidCode'))
      return
    }
    if (code === props.room) {
      toast.success(t('room.alreadyHere'))
      return
    }
    window.location.replace(getRoomURL(code))
  }, [draft, props.room, t])

  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <h2 className="text-xl font-semibold text-[var(--wd-text)] pr-8">
        {t('room.title')}
      </h2>
      <p className="text-sm text-[var(--wd-muted)] mt-2 mb-4 text-left leading-relaxed">
        {t('room.description')}
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          joinRoom()
        }}
      >
        <label
          htmlFor="room-code-input"
          className="block text-xs font-medium uppercase tracking-wider text-[var(--wd-muted)]"
        >
          {t('room.codeLabel')}
        </label>
        <input
          id="room-code-input"
          name="room"
          type="text"
          inputMode="text"
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={6}
          value={draft}
          placeholder={t('room.codePlaceholder')}
          className={roomInputClass}
          aria-invalid={draft.length > 0 && !isGoodRoom(draft)}
          onChange={(e) => setDraft(normalizeRoomCode(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={!isGoodRoom(draft)}
            handleClick={() => {
              void copyWithToast(draft, 'room.copyCodeSuccess')
            }}
          >
            {t('room.copyCode')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={!isGoodRoom(draft)}
          >
            {t('room.joinRoom')}
          </Button>
        </div>
      </form>
      <button
        type="button"
        className="w-full mt-4 mb-2 py-3 px-4 rounded-xl border border-[var(--wd-border)] bg-[var(--wd-surface)] text-sm text-[var(--wd-muted)] hover:bg-[var(--wd-surface-hover)] hover:text-[var(--wd-text)] transition-colors duration-200 text-center touch-manipulation"
        onClick={() => {
          void copyWithToast(
            isGoodRoom(draft) ? draftUrl : roomUrl,
            'room.copySuccess'
          )
        }}
      >
        {t('room.copyLink')}
      </button>
      <p className="text-xs text-[var(--wd-faint)] text-center mb-4">
        {t('room.qrHint')}
      </p>
      <div className="rounded-xl bg-white p-4 w-fit mx-auto shadow-inner">
        <QRCode
          className="w-44 h-44"
          value={isGoodRoom(draft) ? draftUrl : roomUrl}
        />
      </div>
    </Dialog>
  )
}
