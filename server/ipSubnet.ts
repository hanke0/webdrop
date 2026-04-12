import { createHash } from 'crypto'
import type { IncomingMessage } from 'http'

/** Client IP string from proxy headers or socket (Express / bare IncomingMessage). */
export function getClientIp(req: IncomingMessage): string {
  const xReal = req.headers['x-real-ip']
  const forwarded = req.headers['x-forwarded-for']
  const fromForwarded =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : undefined
  const raw =
    (typeof xReal === 'string' && xReal.length > 0 ? xReal : undefined) ??
    fromForwarded ??
    req.socket.remoteAddress ??
    ''
  return typeof raw === 'string' ? raw.trim() : ''
}

function stripZoneAndV4Mapped(raw: string): string {
  let ip = raw.trim()
  const pct = ip.indexOf('%')
  if (pct >= 0) {
    ip = ip.slice(0, pct)
  }
  if (ip.toLowerCase().startsWith('::ffff:')) {
    ip = ip.slice(7)
  }
  return ip
}

function parseIPv4(s: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (!m) {
    return null
  }
  const nums = m.slice(1, 5).map((x) => parseInt(x, 10))
  if (nums.some((n) => n > 255 || Number.isNaN(n))) {
    return null
  }
  return nums as [number, number, number, number]
}

function normalizeHextet(h: string): string {
  return h.toLowerCase().padStart(4, '0')
}

function expandIPv6Groups(s: string): string[] | null {
  if (!s.includes(':')) {
    return null
  }
  const parts = s.split('::')
  if (parts.length > 2) {
    return null
  }
  const left = parts[0] ? parts[0].split(':').filter((p) => p.length > 0) : []
  const right =
    parts.length === 2 && parts[1]
      ? parts[1].split(':').filter((p) => p.length > 0)
      : []
  if (parts.length === 1) {
    if (left.length !== 8) {
      return null
    }
    return left.map(normalizeHextet)
  }
  const missing = 8 - left.length - right.length
  if (missing < 0) {
    return null
  }
  const all = [...left, ...Array(missing).fill('0'), ...right]
  if (all.length !== 8) {
    return null
  }
  return all.map(normalizeHextet)
}

/**
 * Stable seed per LAN segment: private IPv4 → /24; public IPv4 → full address;
 * IPv6 → /64 when parsable; ::1 → loopback bucket.
 */
export function subnetSeedForLanRoom(ipRaw: string): string {
  const ip = stripZoneAndV4Mapped(ipRaw)
  if (!ip) {
    return 'unknown'
  }

  const v4 = parseIPv4(ip)
  if (v4) {
    const [a, b, c, d] = v4
    const useSlash24 =
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 127 ||
      (a === 169 && b === 254)
    if (useSlash24) {
      return `v4:${a}.${b}.${c}.0`
    }
    return `v4:${a}.${b}.${c}.${d}`
  }

  if (ip === '::1') {
    return 'v6:loopback'
  }

  const g = expandIPv6Groups(ip)
  if (g && g.length >= 4) {
    return `v6:${g.slice(0, 4).join(':')}::`
  }
  return `v6:${ip}`
}

/** 6-char room code from subnet seed (MD5 → custom base64). */
export function roomCodeFromSeed(seed: string): string {
  const bname = createHash('md5').update(seed).digest('base64')
  let name = ''
  for (let b of bname) {
    b = b.toUpperCase()
    switch (b) {
      case '+':
        name += '0'
        break
      case '/':
        name += '1'
        break
      case '=':
        name += '2'
        break
      default:
        name += b
    }
    if (name.length === 6) {
      break
    }
  }
  while (name.length !== 6) {
    name += 'Z'
  }
  return name
}
