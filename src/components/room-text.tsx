import { useState } from 'react'
import { RoomState } from '../hooks/useInitRoom'
import { RoomDialog } from './room-dialog'
import { isGoodRoom } from '../lib/room'

export type RoomTextProps = {
  room: RoomState
}

export function RoomText(props: RoomTextProps) {
  const [sShowRoom, setShowRoom] = useState(false)

  if (props.room.isLoading || !isGoodRoom(props.room.room)) {
    return <div>You are in default Room</div>
  }

  return (
    <div className={`text-1xl mb-3`}>
      Room:
      <a
        className="text-blue-500 hover:pointer"
        href="#"
        onClick={(e) => {
          e.preventDefault()
          setShowRoom(true)
        }}
      >
        {props.room.room}
      </a>
      {sShowRoom && (
        <RoomDialog room={props.room.room} onClose={() => setShowRoom(false)} />
      )}
    </div>
  )
}
