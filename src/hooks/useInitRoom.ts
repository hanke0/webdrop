import { getRoomAndUid, getRoomFromCookie } from '../lib/client'
import { useReducer, useEffect } from 'react'
import {
  generateName,
  randomRoomID,
  isGoodRoom,
  parseUsername,
  Username,
} from '../lib/room'

export type RoomState = {
  isLoading: boolean
  room: string
  user: Username
}

enum RoomActionType {
  'SET_ROOM',
  'SET_USER',
  'SET_LOADING',
}

type RoomAction =
  | {
      type: RoomActionType.SET_ROOM
      payload: string
    }
  | {
      type: RoomActionType.SET_USER
      payload: Username
    }
  | {
      type: RoomActionType.SET_LOADING
      payload: boolean
    }

const useRoomReducer = (state: RoomState, action: RoomAction) => {
  switch (action.type) {
    case RoomActionType.SET_ROOM:
      return { ...state, room: action.payload }
    case RoomActionType.SET_USER:
      return { ...state, user: action.payload }
    case RoomActionType.SET_LOADING:
      return { ...state, isLoading: action.payload }
    default:
      return state
  }
}

export function useInitRoom() {
  const initialState: RoomState = {
    isLoading: true,
    room: '',
    user: { prefix: '', name: '', fullName: ''},
  }
  const [state, dispatch] = useReducer(useRoomReducer, initialState)

  useEffect(() => {
    const [rid, uid] = getRoomAndUid()

    const setRoom = (rid: string) => {
      if (rid && isGoodRoom(rid)) {
        dispatch({ type: RoomActionType.SET_ROOM, payload: rid })
        return
      }
      const crid = getRoomFromCookie()
      if (crid && isGoodRoom(crid)) {
        dispatch({ type: RoomActionType.SET_ROOM, payload: crid })
        return
      }
      dispatch({ type: RoomActionType.SET_ROOM, payload: randomRoomID() })
    }
    setRoom(rid)

    const setUser = (uid: string) => {
      if (uid) {
        const user = parseUsername(uid)
        if (user) {
          dispatch({ type: RoomActionType.SET_USER, payload: user })
          return
        }
      }
      const user = generateName()
      dispatch({ type: RoomActionType.SET_USER, payload: user })
    }
    setUser(uid)
    dispatch({ type: RoomActionType.SET_LOADING, payload: false })
  }, [])

  return state
}
