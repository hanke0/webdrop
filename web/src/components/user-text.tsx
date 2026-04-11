import { UserHead } from './user-head'
import { RoomDialog } from './room-dialog'
import { getRoom, getUserShowName } from '../lib/room'
import toast from 'react-hot-toast'
import { useRef } from 'react'

export type UserTextProps = {
  uid: string
}

export function UserText({ uid }: UserTextProps) {
  const roomDialogOpenRef = useRef<HTMLAnchorElement>(null)
  const name = getUserShowName(uid)
  const room = getRoom(uid)
  const copyUser = () => {
    navigator?.clipboard
      ?.writeText(uid)
      .then(() => {
        toast.success(
          'Username has copied to clipboard',
          { icon: '📋', id: "copy-username" }
        )
      })
      .catch((err) => {
        toast.error('copy username fail', { icon: '📋', id: "copy-username" })
        console.error('copy username fail:', err)
      })
  }

  return (
    <div className="container flex flex-row py-4">
      <div className="flex mx-2">
        <UserHead uid={uid} />
      </div>
      <div className="flex mx-2">
        <div className="container flex flex-col">
          <div className="text-gray-800">Hi</div>
          <div className="flex font-bold text-2xl text-gray-600 hover:text-gray-800 cursor-pointer"
            onClick={copyUser}
          >{name}
          </div>
          <div className="flex text-gray-300">
            <span>Anyone in the room</span>
            <a className="flex text-gray-400 cursor-pointer px-1 hover:text-gray-700"
              ref={roomDialogOpenRef}
            >
              {room}
            </a>
            <span>can send file to you</span>
          </div>
        </div>
      </div>
      <RoomDialog room={room} open={roomDialogOpenRef} />
    </div >
  )
}
