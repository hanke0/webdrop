import { isGoodUser } from '../room'

/**
 * Resolves a user-visible name (or raw logical id) to the full logical id for outbound WebRTC.
 * Used when connecting by display name within the current room.
 */
export function resolveOutboundLogicalId(room: string, fullName: string): string {
  if (isGoodUser(fullName)) {
    return `${room}-${fullName}`
  }
  const maybe = fullName.toLowerCase().replace(' ', '-')
  if (isGoodUser(maybe)) {
    return `${room}-${maybe}`
  }
  return fullName
}
