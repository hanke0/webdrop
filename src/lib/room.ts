import { icons, prefixes } from './names'
import config from './config'
import { sample, sampleSize } from 'lodash'

const roomRE = /^[A-Z0-9]{6}$/
export function isGoodRoom(room: string): boolean {
  return roomRE.test(room)
}

const usernameRE = /^[a-z]+-[a-z]+$/
export function isGoodUser(user: string): boolean {
  return usernameRE.test(user) && icons.includes(user.split('-')[1])
}

const roomAndNameRE = /^[A-Z0-9]{6}-[a-z]+-[a-z]+$/
export function isGoodRoomAndName(id: string): boolean {
  return roomAndNameRE.test(id)
}

const alnum = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function randomRoom(): string {
  return sampleSize(alnum, 6).join('')
}

export const randomUser = (): string => {
  const prefix = sample(prefixes)
  if (!prefix) throw new Error('prefix is undefined')
  const name = sample(icons)
  if (!name) throw new Error('name is undefined')
  return `${prefix}-${name}`
}

export const getRoom = (uid: string): string => {
  if (isGoodRoomAndName(uid)) {
    return uid.split('-')[0]
  }
  return ''
}

export const getUserIconPath = (uid: string): string => {
  let name = ''
  if (isGoodUser(uid)) {
    name = uid.split('-')[1]
  } else if (isGoodRoomAndName(uid)) {
    name = uid.split('-')[2]
  }
  if (name && icons.includes(name)) {
    return `${config.BASE_URL}icons/${name}.svg`
  }
  return `${config.BASE_URL}icons/default.svg`
}

function _getUserShowName(prefix: string, name: string): string {
  return prefix.charAt(0).toUpperCase() + prefix.slice(1) + ' '
    + name.charAt(0).toUpperCase() + name.slice(1)
}

export const getUserShowName = (uid: string): string => {
  if (isGoodUser(uid)) {
    const parts = uid.split('-')
    return _getUserShowName(parts[0], parts[1])
  }
  if (isGoodRoomAndName(uid)) {
    const parts = uid.split('-')
    if (parts.length === 3) {
      return _getUserShowName(parts[1], parts[2])
    }
  }
  return uid
}

export const splitRoomAndUser = (uid: string): [string, string] | [] => {
  if (!isGoodRoomAndName(uid)) {
    return []
  }
  const index = uid.indexOf('-')
  if (index === -1) {
    return []
  }
  return [uid.substring(0, index), uid.substring(index + 1)]
}
