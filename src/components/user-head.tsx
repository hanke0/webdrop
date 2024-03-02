import { getUserIconPath, splitRoomAndUser } from '../lib/room'

export type UserHeadProps = {
  uid: string
}

export const UserHead = ({ uid }: UserHeadProps) => {
  const src = getUserIconPath(uid)
  const [, user] = splitRoomAndUser(uid)
  return (
    <div className="w-24 h-24 border rounded-full shadow">
      <div className="p-2 rounded">
        <img
          className="object-fill"
          alt="user head"
          src={src}
          title={user || uid}
        />
      </div>
    </div>
  )
}
