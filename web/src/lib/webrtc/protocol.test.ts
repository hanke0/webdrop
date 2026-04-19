import { describe, expect, it, vi } from 'vitest'
import { PROTOCOL_V, SIGNAL_USERNAME_IN_USE_CODE } from './constants'
import { clearPendingBooleanResponses } from './pending'
import { resolvePeerId } from './connect-id'
import { signalingClosedMessage } from './signaling-ws'

describe('signalingClosedMessage', () => {
  it('explains username collision when code matches server', () => {
    expect(signalingClosedMessage(SIGNAL_USERNAME_IN_USE_CODE)).toContain(
      'already in use'
    )
  })

  it('uses a generic message for other close codes', () => {
    expect(signalingClosedMessage(1006)).toContain('signaling')
  })
})

describe('PROTOCOL_V', () => {
  it('matches server wire version', () => {
    expect(PROTOCOL_V).toBe(2)
  })
})

describe('resolvePeerId', () => {
  it('prefixes room for a valid session user id', () => {
    expect(resolvePeerId('ABC123', 'happy-cat')).toBe('ABC123-happy-cat')
  })

  it('normalizes display-style input', () => {
    expect(resolvePeerId('ABC123', 'Happy Cat')).toBe('ABC123-happy-cat')
  })
})

describe('clearPendingBooleanResponses', () => {
  it('rejects every pending entry and empties the map', () => {
    const map = new Map<
      string,
      {
        resolve: (v: boolean) => void
        promiseReject: (e: Error) => void
        timer: ReturnType<typeof setTimeout>
      }
    >()
    const rejectA = vi.fn()
    const rejectB = vi.fn()
    map.set('a', {
      resolve: vi.fn(),
      promiseReject: rejectA,
      timer: setTimeout(() => {}, 60_000),
    })
    map.set('b', {
      resolve: vi.fn(),
      promiseReject: rejectB,
      timer: setTimeout(() => {}, 60_000),
    })
    const err = new Error('x')
    clearPendingBooleanResponses(map, err)
    expect(map.size).toBe(0)
    expect(rejectA).toHaveBeenCalledWith(err)
    expect(rejectB).toHaveBeenCalledWith(err)
  })
})
