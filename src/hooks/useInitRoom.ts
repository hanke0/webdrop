import { getRoomAndUser, getLocalRoom } from '../lib/client'
import { useEffect, useRef, useState } from 'react'
import { P2P } from '../lib/p2p'
import { toast } from 'react-hot-toast'

import {
  randomUser,
  randomRoom,
  isGoodRoom,
  isGoodUser,
  splitRoomAndUser,
} from '../lib/room'

export type RoomState = {
  isLoading: boolean
  room: string
  user: string
  me: string // full id, include room and user
  peer?: P2P
  err?: Error
}

export function useInitRoom() {
  const initialState: RoomState = {
    isLoading: true,
    room: '',
    user: '',
    me: '',
  }
  const refState = useRef(initialState)
  const [state, setState] = useState(initialState)

  useEffect(() => {
    const [rid, uid] = getRoomAndUser()
    const newState = { ...refState.current }

    const setRoom = (rid: string) => {
      if (rid && isGoodRoom(rid)) {
        newState.room = rid
        return
      }
      const crid = getLocalRoom()
      if (crid && isGoodRoom(crid)) {
        newState.room = crid
        return
      }
      newState.room = randomRoom()
    }
    setRoom(rid)

    const setUser = (uid: string) => {
      if (uid && isGoodUser(uid)) {
        newState.user = uid
        return
      }
      newState.user = randomUser()
    }
    setUser(uid)

    newState.me = newState.room + '-' + newState.user

    const peer = new P2P({
      room: newState.room,
      user: newState.user,
    })
    peer.onOpen((id) => {
      console.log('peer is open', id)
      const [room, user] = splitRoomAndUser(id)
      if (room && user) {
        newState.room = room
        newState.user = user
      } else {
        newState.room = ''
        newState.user = id
      }
      newState.me = id
      newState.peer = peer
      newState.isLoading = false
      setState(newState)
    })
    peer.onError((err) => {
      console.log('peer error ---- ', err)
      toast.error(`peer error: ${err.message}`)
      newState.err = err
      newState.isLoading = false
      setState(newState)
    })
  }, [refState])
  return state
}
