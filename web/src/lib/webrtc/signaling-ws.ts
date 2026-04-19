import { SIGNAL_USERNAME_IN_USE_CODE } from './constants'

export function signalingClosedMessage(closeCode: number): string {
  return closeCode === SIGNAL_USERNAME_IN_USE_CODE
    ? 'This username is already in use in this room'
    : 'WebRTC signaling connection closed'
}

/** Wait until the signaling WebSocket handshake completes (open or failure). */
export async function waitForSignalingWebSocket(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let sawOpen = false
    let handshakeCloseCode = 0
    let finished = false
    const cleanup = () => {
      ws.removeEventListener('close', onHandshakeClose)
    }
    const fail = (err: Error) => {
      if (finished) {
        return
      }
      finished = true
      cleanup()
      reject(err)
    }
    const ok = () => {
      if (finished) {
        return
      }
      finished = true
      cleanup()
      resolve()
    }
    const onHandshakeClose = (ev: CloseEvent) => {
      handshakeCloseCode = ev.code
      queueMicrotask(() => {
        if (finished || sawOpen) {
          return
        }
        fail(new Error(signalingClosedMessage(handshakeCloseCode)))
      })
    }
    ws.addEventListener('close', onHandshakeClose)
    ws.onopen = () => {
      sawOpen = true
      queueMicrotask(() => {
        if (finished) {
          return
        }
        if (ws.readyState !== WebSocket.OPEN) {
          fail(new Error(signalingClosedMessage(handshakeCloseCode)))
          return
        }
        ok()
      })
    }
    ws.onerror = () => {
      fail(new Error('WebRTC signaling connection failed'))
    }
  })
}
