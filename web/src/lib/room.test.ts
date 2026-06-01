import { describe, expect, it } from 'vitest'
import { isGoodRoom, normalizeRoomCode } from './room'

describe('normalizeRoomCode', () => {
  it('uppercases and strips invalid characters', () => {
    expect(normalizeRoomCode('ab-12!c')).toBe('AB12C')
  })

  it('caps length at 6', () => {
    expect(normalizeRoomCode('ABCDEFGH')).toBe('ABCDEF')
  })
})

describe('isGoodRoom', () => {
  it('accepts a normalized 6-character code', () => {
    const code = normalizeRoomCode('abc123')
    expect(isGoodRoom(code)).toBe(true)
  })
})
