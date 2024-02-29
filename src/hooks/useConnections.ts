import { LazyConnection } from '../lib/p2p'
import { useCallback, useState } from 'react'

export default function useConnections() {
  const [connections, setConnections] = useState<LazyConnection[]>([])

  const addConnection = useCallback((...conn: LazyConnection[]) => {
    setConnections((prev: LazyConnection[]) => {
      const n = [...prev]
      for (const co of conn) {
        if (!prev.find((c) => c.id === co.id)) {
          n.push(co)
        }
      }
      if (n.length == prev.length) {
        return prev
      }
      return n
    })
  }, [])

  const removeConnection = useCallback((...conn: LazyConnection[]) => {
    setConnections((prev) => {
      let n = prev
      for (const co of conn) {
        n = n.filter((c) => c.id !== co.id)
      }
      if (n.length == prev.length) {
        return prev
      }
      return n
    })
  }, [])

  const resetConnection = useCallback((conns: LazyConnection[]) => {
    setConnections(conns)
  }, [])
  return [connections, addConnection, removeConnection, resetConnection] as const
}
