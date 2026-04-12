import { fromString } from 'uint8arrays'
import { describe, expect, it, vi } from 'vitest'
import { SIGNAL_USERNAME_IN_USE_CODE } from './constants'
import { clearPendingBooleanResponses } from './pending'
import { parseDcFrameHeader } from './data-channel'
import { parseHelloJsonPayload } from './hello'
import { resolveOutboundLogicalId } from './connect-id'
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

describe('parseHelloJsonPayload', () => {
  it('returns logicalId for a valid hello', () => {
    const payload = fromString(
      JSON.stringify({ type: 'hello', logicalId: 'ROOM12-happy-cat' })
    )
    expect(parseHelloJsonPayload(payload)).toEqual({
      logicalId: 'ROOM12-happy-cat',
    })
  })

  it('throws on malformed payload', () => {
    const payload = fromString(JSON.stringify({ type: 'nope' }))
    expect(() => parseHelloJsonPayload(payload)).toThrow('invalid hello')
  })
})

describe('parseDcFrameHeader', () => {
  it('reads big-endian length', () => {
    const header = new Uint8Array([2, 0, 0, 0, 42])
    expect(parseDcFrameHeader(header)).toEqual({
      frameType: 2,
      payloadByteLength: 42,
    })
  })

  it('rejects short buffers', () => {
    expect(() => parseDcFrameHeader(new Uint8Array(3))).toThrow('5 bytes')
  })
})

describe('resolveOutboundLogicalId', () => {
  it('prefixes room for a valid session user id', () => {
    expect(resolveOutboundLogicalId('ABC123', 'happy-cat')).toBe(
      'ABC123-happy-cat'
    )
  })

  it('normalizes display-style input', () => {
    expect(resolveOutboundLogicalId('ABC123', 'Happy Cat')).toBe(
      'ABC123-happy-cat'
    )
  })
})

describe('clearPendingBooleanResponses', () => {
  it('rejects every pending entry and empties the map', () => {
    const map = new Map<string, { resolve: (v: boolean) => void; promiseReject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
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
