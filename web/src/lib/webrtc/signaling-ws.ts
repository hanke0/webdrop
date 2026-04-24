import { SIGNAL_USERNAME_IN_USE_CODE } from './constants'
import type { SignalBody } from './types'

/** First server frame after a successful handshake. */
export type Welcome = {
  room: string
  peerId: string
  peers: string[]
}

export type SignalLinkEvents = {
  peerJoin: (peerId: string) => void
  peerLeave: (peerId: string) => void
  signal: (from: string, body: SignalBody) => void
  peers: (peers: string[]) => void
  close: () => void
}

export const SIGNAL_WELCOME_TIMEOUT_MS = 10_000
const SIGNAL_PING_INTERVAL_MS = 2_000

export function signalingClosedMessage(closeCode: number): string {
  return closeCode === SIGNAL_USERNAME_IN_USE_CODE
    ? 'This username is already in use in this room'
    : 'WebRTC signaling connection closed'
}

function buildUrl(user: string, room: string | null): string {
  const { protocol, host } = window.location
  const wsScheme = protocol === 'https:' ? 'wss:' : 'ws:'
  const q = new URLSearchParams({ user })
  if (room) {
    q.set('room', room)
  }
  return `${wsScheme}//${host}/api/v2/ws?${q}`
}

type ServerMsg =
  | { type: 'welcome'; room: string; peerId: string; peers: string[] }
  | { type: 'peer.join'; peerId: string }
  | { type: 'peer.leave'; peerId: string }
  | { type: 'peers'; peers: string[] }
  | { type: 'signal'; from: string; body: SignalBody }
  | { type: 'pong' }

/**
 * Single-socket link to the server: handles the welcome handshake, dispatches
 * presence events, forwards signaling frames.
 */
export class SignalLink {
  readonly room: string
  readonly peerId: string
  readonly initialPeers: string[]
  private readonly ws: WebSocket
  private events: Partial<SignalLinkEvents> = {}
  private closed = false
  private closeNotified = false
  private pingTimer: ReturnType<typeof setInterval> | null = null

  private constructor(ws: WebSocket, welcome: Welcome) {
    this.ws = ws
    this.room = welcome.room
    this.peerId = welcome.peerId
    this.initialPeers = welcome.peers
    this.attachMessageLoop()
    this.startPingLoop()
  }

  static async open(options: {
    user: string
    room: string | null
  }): Promise<SignalLink> {
    const ws = new WebSocket(buildUrl(options.user, options.room))
    const welcome = await waitForWelcome(ws)
    return new SignalLink(ws, welcome)
  }

  on<K extends keyof SignalLinkEvents>(
    name: K,
    fn: SignalLinkEvents[K]
  ): void {
    this.events[name] = fn
  }

  /** Ask the server to re-send the current peer roster. */
  requestPeers(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'peers' }))
    }
  }

  sendSignal(to: string, body: SignalBody): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'signal', to, body }))
    }
  }

  close(): void {
    if (this.closed) {
      return
    }
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }

  private notifyClose(): void {
    if (this.closeNotified) {
      return
    }
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    this.closeNotified = true
    this.closed = true
    this.events.close?.()
  }

  private startPingLoop(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        return
      }
      this.ws.send(JSON.stringify({ type: 'ping' }))
    }, SIGNAL_PING_INTERVAL_MS)
  }

  private attachMessageLoop(): void {
    this.ws.onmessage = (ev) => {
      let parsed: ServerMsg
      try {
        parsed = JSON.parse(ev.data as string) as ServerMsg
      } catch {
        return
      }
      if (!parsed || typeof parsed !== 'object') {
        return
      }
      switch (parsed.type) {
        case 'peer.join':
          if (typeof parsed.peerId === 'string') {
            this.events.peerJoin?.(parsed.peerId)
          }
          return
        case 'peer.leave':
          if (typeof parsed.peerId === 'string') {
            this.events.peerLeave?.(parsed.peerId)
          }
          return
        case 'peers':
          if (Array.isArray(parsed.peers)) {
            this.events.peers?.(parsed.peers.filter((p) => typeof p === 'string'))
          }
          return
        case 'signal':
          if (
            typeof parsed.from === 'string' &&
            parsed.body &&
            typeof parsed.body === 'object'
          ) {
            this.events.signal?.(parsed.from, parsed.body as SignalBody)
          }
          return
        case 'pong':
          return
        default:
          return
      }
    }
    this.ws.onclose = () => {
      this.notifyClose()
    }
  }
}

async function waitForWelcome(ws: WebSocket): Promise<Welcome> {
  return await new Promise<Welcome>((resolve, reject) => {
    let finished = false
    const timeout = setTimeout(() => {
      fail(new Error('Timed out waiting for signaling welcome'))
    }, SIGNAL_WELCOME_TIMEOUT_MS)
    const cleanup = () => {
      clearTimeout(timeout)
      ws.removeEventListener('close', onClose)
      ws.removeEventListener('message', onMessage)
      ws.removeEventListener('error', onError)
    }
    const fail = (err: Error) => {
      if (finished) {
        return
      }
      finished = true
      cleanup()
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      reject(err)
    }
    const ok = (w: Welcome) => {
      if (finished) {
        return
      }
      finished = true
      cleanup()
      resolve(w)
    }
    const onClose = (ev: CloseEvent) => {
      fail(new Error(signalingClosedMessage(ev.code)))
    }
    const onMessage = (ev: MessageEvent) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(ev.data as string)
      } catch {
        return
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as { type?: unknown }).type === 'welcome'
      ) {
        const p = parsed as Partial<Welcome> & { type: 'welcome' }
        if (
          typeof p.room === 'string' &&
          typeof p.peerId === 'string' &&
          Array.isArray(p.peers)
        ) {
          ok({
            room: p.room,
            peerId: p.peerId,
            peers: p.peers.filter((x): x is string => typeof x === 'string'),
          })
        } else {
          fail(new Error('Malformed welcome from signaling server'))
        }
      }
    }
    const onError = () => {
      fail(new Error('WebRTC signaling connection failed'))
    }
    ws.addEventListener('close', onClose)
    ws.addEventListener('message', onMessage)
    ws.addEventListener('error', onError)
  })
}
