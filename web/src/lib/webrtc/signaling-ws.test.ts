import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SIGNAL_WELCOME_TIMEOUT_MS,
  SignalLink,
} from './signaling-ws'

type ListenerMap = {
  close: Set<(event: CloseEvent) => void>
  error: Set<() => void>
  message: Set<(event: MessageEvent) => void>
}

class FakeWebSocket {
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []

  readonly listeners: ListenerMap = {
    close: new Set(),
    error: new Set(),
    message: new Set(),
  }
  readonly sent: string[] = []
  readyState = FakeWebSocket.OPEN
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(
    type: keyof ListenerMap,
    listener: ListenerMap[keyof ListenerMap] extends Set<infer T> ? T : never
  ) {
    ;(this.listeners[type] as Set<typeof listener>).add(listener)
  }

  removeEventListener(
    type: keyof ListenerMap,
    listener: ListenerMap[keyof ListenerMap] extends Set<infer T> ? T : never
  ) {
    ;(this.listeners[type] as Set<typeof listener>).delete(listener)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close(code = 1000) {
    this.emitClose(code)
  }

  emitMessage(payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent
    this.onmessage?.(event)
    for (const listener of this.listeners.message) {
      listener(event)
    }
  }

  emitClose(code = 1000) {
    this.readyState = 3
    const event = { code } as CloseEvent
    this.onclose?.(event)
    for (const listener of this.listeners.close) {
      listener(event)
    }
  }
}

describe('SignalLink', () => {
  const originalWindow = globalThis.window
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.useRealTimers()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { protocol: 'http:', host: 'example.test' },
      },
    })
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: FakeWebSocket,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: originalWebSocket,
    })
  })

  it('opens after receiving welcome and can request peers', async () => {
    const openPromise = SignalLink.open({ user: 'happy-cat', room: 'ABC123' })
    const ws = FakeWebSocket.instances[0]

    expect(ws?.url).toContain('/api/v2/ws?')
    ws.emitMessage({
      type: 'welcome',
      room: 'ABC123',
      peerId: 'ABC123-happy-cat',
      peers: ['ABC123-silent-fox'],
    })

    const link = await openPromise
    link.requestPeers()

    expect(link.room).toBe('ABC123')
    expect(link.peerId).toBe('ABC123-happy-cat')
    expect(link.initialPeers).toEqual(['ABC123-silent-fox'])
    expect(ws.sent).toContain(JSON.stringify({ type: 'peers' }))
  })

  it('times out if welcome never arrives', async () => {
    vi.useFakeTimers()

    const openPromise = SignalLink.open({ user: 'happy-cat', room: null })
    const rejection = expect(openPromise).rejects.toThrow(
      'Timed out waiting for signaling welcome'
    )

    await vi.advanceTimersByTimeAsync(SIGNAL_WELCOME_TIMEOUT_MS)

    await rejection
  })

  it('emits close even when the client initiates shutdown', async () => {
    const openPromise = SignalLink.open({ user: 'happy-cat', room: 'ABC123' })
    const ws = FakeWebSocket.instances[0]
    ws.emitMessage({
      type: 'welcome',
      room: 'ABC123',
      peerId: 'ABC123-happy-cat',
      peers: [],
    })

    const link = await openPromise
    const onClose = vi.fn()
    link.on('close', onClose)

    link.close()

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
