import { getUserIconPath, splitRoomAndUser } from '../lib/room'

export type UserHeadProps = {
  uid: string
  size?: 'md' | 'sm'
}

const sizeClass = {
  md: 'w-24 h-24',
  sm: 'w-[4.5rem] h-[4.5rem]',
} as const

export const UserHead = ({ uid, size = 'md' }: UserHeadProps) => {
  const src = getUserIconPath(uid)
  const [, user] = splitRoomAndUser(uid)
  const dim = sizeClass[size]
  const pad = size === 'sm' ? 'p-1.5' : 'p-2'
  return (
    <div
      className={`${dim} rounded-full border border-[var(--wd-border-strong)] bg-[var(--wd-surface)] shadow-[0_8px_24px_-8px_rgba(15,23,42,0.1)] ring-2 ring-[var(--wd-accent-glow)]/50 overflow-hidden shrink-0`}
    >
      <div className={`${pad} rounded-full h-full`}>
        <img
          className="w-full h-full object-cover rounded-full"
          alt=""
          src={src}
          title={user || uid}
        />
      </div>
    </div>
  )
}
