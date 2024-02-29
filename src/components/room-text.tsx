import { RoomDialog } from './room-dialog'
import { isGoodRoom } from '../lib/room'
import { P2P } from '../lib/p2p'
import { useRef } from 'react'

export type RoomTextProps = {
  peer: P2P
}

export function RoomText(props: RoomTextProps) {
  const ref = useRef<HTMLAnchorElement>(null)

  if (!props.peer || !isGoodRoom(props.peer.room)) {
    return <div>You are in default Room</div>
  }

  return (
    <div className={`text-1xl mb-3`}>
      Room:
      <a className="text-blue-500 hover:pointer" href="#" ref={ref}>
        {props.peer.room}
      </a>
      <RoomDialog room={props.peer.room} open={ref} />
    </div>
  )
}
