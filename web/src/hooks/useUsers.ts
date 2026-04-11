import { LazyConnection } from "../lib/p2p";
import { useCallback, useState } from "react";

function add(conn: LazyConnection, list: LazyConnection[]) {
  if (!list.find((c) => c.id === conn.id)) {
    return [...list, conn]
  }
  return list
}

function remove(conn: LazyConnection, list: LazyConnection[]) {
  return list.filter((c) => c.id !== conn.id)
}

export default function useUsers() {
  const [state, setState] = useState({
    conns: [] as LazyConnection[],
    roomUsers: [] as LazyConnection[],
  })

  const addUser = useCallback((conn: LazyConnection) => {
    setState((prev) => {
      const n = { ...prev }
      n.conns = add(conn, n.conns)
      n.roomUsers = remove(conn, n.roomUsers)
      if (n.conns.length === prev.conns.length && n.roomUsers.length === prev.roomUsers.length) {
        return prev
      }
      return n
    })
  }, [])

  const removeUser = useCallback((conn: LazyConnection) => {
    setState((prev) => {
      const n = { ...prev }
      n.conns = remove(conn, n.conns)
      n.roomUsers = remove(conn, n.roomUsers)
      if (n.conns.length === prev.conns.length && n.roomUsers.length === prev.roomUsers.length) {
        return prev
      }
      return n
    })
  }, [])

  const resetRoomUsers = useCallback((conns: LazyConnection[]) => {
    setState((prev) => {
      return {
        conns: prev.conns,
        roomUsers: conns.filter((c) => !prev.conns.find((cc) => cc.id === c.id)),
      }
    })
  }, [])

  const getUsers = useCallback(() => {
    return [...state.conns, ...state.roomUsers]
  }, [state])

  return [
    getUsers,
    addUser,
    removeUser,
    resetRoomUsers,
  ] as const
}
