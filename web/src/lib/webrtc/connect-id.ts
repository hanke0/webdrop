import { isGoodUser } from '../room'

/**
 * Resolves a display-style user name (or raw peer id) to full `ROOM-user-user` peer id.
 */
export function resolvePeerId(room: string, fullName: string): string {
  if (isGoodUser(fullName)) {
    return `${room}-${fullName}`
  }
  const maybe = fullName.toLowerCase().replace(/ /g, '-')
  if (isGoodUser(maybe)) {
    return `${room}-${maybe}`
  }
  return fullName
}
