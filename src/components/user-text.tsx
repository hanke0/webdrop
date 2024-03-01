import { UserHead } from './user-head'
import { splitRoomAndUser } from '../lib/room'
import toast from 'react-hot-toast'

export type UserTextProps = {
  uid: string
}

export function UserText({ uid }: UserTextProps) {
  const [, user] = splitRoomAndUser(uid)
  return (
    <div>
      You are
      <span
        onClick={() => {
          navigator?.clipboard
            ?.writeText(uid)
            .then(() => {
              toast.success('copy username to clipboard')
            })
            .catch((err) => {
              console.log('copy fail:', err)
            })
        }}
        className="inline border rounded-full mx-3 py-1 px-3"
      >
        <UserHead
          className="inline mb-1"
          user={user || ''}
          width={20}
          height={20}
        />
        <span className="cursor-pointer">{user || uid}</span>
      </span>
    </div>
  )
}
