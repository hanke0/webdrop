import { UserHead } from './user-head'
import { RoomDialog } from './room-dialog'
import { getRoom, getUserShowName } from '../lib/room'
import toast from 'react-hot-toast'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

export type UserTextProps = {
  uid: string
}

export function UserText({ uid }: UserTextProps) {
  const { t } = useTranslation()
  const roomDialogOpenRef = useRef<HTMLButtonElement>(null)
  const name = getUserShowName(uid)
  const room = getRoom(uid)
  const copyUser = () => {
    navigator?.clipboard
      ?.writeText(uid)
      .then(() => {
        toast.success(t('user.copySuccess'), { icon: '📋', id: 'copy-username' })
      })
      .catch((err) => {
        toast.error(t('user.copyFail'), { icon: '📋', id: 'copy-username' })
        console.error('copy username fail:', err)
      })
  }

  return (
    <div className="flex flex-row gap-4 items-center">
      <UserHead uid={uid} />
      <div className="flex flex-col gap-1.5 min-w-0 flex-1 text-left">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--wd-muted)]">
          {t('user.identity')}
        </span>
        <button
          type="button"
          onClick={copyUser}
          className="text-left text-xl font-semibold tracking-tight text-[var(--wd-text)] hover:text-[var(--wd-accent-bright)] transition-colors duration-200 truncate"
        >
          {name}
        </button>
        <p className="text-sm text-[var(--wd-muted)] leading-relaxed">
          {t('user.roomHintBefore')}
          <button
            type="button"
            className="font-mono text-[var(--wd-accent)] hover:text-[var(--wd-accent-bright)] underline-offset-2 hover:underline transition-colors"
            ref={roomDialogOpenRef}
          >
            {room}
          </button>
          {t('user.roomHintAfter')}
        </p>
      </div>
      <RoomDialog room={room} open={roomDialogOpenRef} />
    </div>
  )
}
