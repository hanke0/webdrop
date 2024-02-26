import { sample, sampleSize } from 'lodash'

import { icons, prefixes } from './names'

export type Username = {
  prefix: string
  name: string
  fullName: string
}

export const generateName = (): Username => {
  const prefix = sample(prefixes)
  if (!prefix) throw new Error('prefix is undefined')
  const name = sample(icons)
  if (!name) throw new Error('name is undefined')
  return {
    prefix,
    name,
    fullName: `${prefix}-${name}`,
  }
}

export const parseUsername = (fullName: string): Username | null => {
  const [prefix, name] = fullName.split('-')
  if (prefixes.includes(prefix) && icons.includes(name)) {
    return {
      prefix,
      name,
      fullName,
    }
  }
  return null
}

export const parseRoomAndName = (uid: string): [string, Username] | [] => {
  const index = uid.indexOf('-')
  const name = parseUsername(uid.substring(index + 1))
  if (!name) {
    return []
  }
  return [uid.substring(0, index), name]
}

const alnum = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function randomRoomID(): string {
  return sampleSize(alnum, 6).join('')
}

const roomRE = /^[A-Z0-9]{6}$/
export function isGoodRoom(room: string): boolean {
  return roomRE.test(room)
}
