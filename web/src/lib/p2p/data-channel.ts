import { concat } from 'uint8arrays/concat'

/** First byte + big-endian uint32 payload length (matches `writeDcFrame`). */
export function parseDcFrameHeader(header5: Uint8Array): {
  frameType: number
  payloadByteLength: number
} {
  if (header5.byteLength < 5) {
    throw new Error('frame header must be 5 bytes')
  }
  const frameType = header5[0]!
  const payloadByteLength = new DataView(
    header5.buffer,
    header5.byteOffset + 1,
    4
  ).getUint32(0, false)
  return { frameType, payloadByteLength }
}

export async function channelSendAll(
  ch: RTCDataChannel,
  data: Uint8Array
): Promise<void> {
  const MAX = 16 * 1024
  let offset = 0
  while (offset < data.length) {
    if (ch.readyState !== 'open') {
      throw new Error('data channel closed')
    }
    const slice = data.subarray(offset, offset + MAX)
    while (ch.bufferedAmount > 8 * 1024 * 1024) {
      await new Promise<void>((resolve) => {
        ch.addEventListener('bufferedamountlow', () => resolve(), { once: true })
      })
    }
    ch.send(new Uint8Array(slice))
    offset += slice.length
  }
}

export async function writeDcFrame(
  ch: RTCDataChannel,
  frameType: number,
  payload: Uint8Array
): Promise<void> {
  const header = new Uint8Array(5)
  header[0] = frameType
  new DataView(header.buffer).setUint32(1, payload.byteLength, false)
  await channelSendAll(ch, header)
  await channelSendAll(ch, payload)
}

export class DataChannelReader {
  private buf = new Uint8Array(0)
  private queue: Uint8Array[] = []
  private wait: (() => void) | null = null
  private ended = false

  constructor(ch: RTCDataChannel) {
    ch.binaryType = 'arraybuffer'
    ch.onmessage = (ev) => {
      const u8 = new Uint8Array(ev.data as ArrayBuffer)
      this.queue.push(u8)
      if (this.wait) {
        this.wait()
        this.wait = null
      }
    }
    ch.onclose = () => {
      this.ended = true
      if (this.wait) {
        this.wait()
        this.wait = null
      }
    }
  }

  async read(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) {
      if (this.queue.length > 0) {
        const next = this.queue.shift()!
        const merged =
          this.buf.length === 0 ? next : concat([this.buf, next])
        this.buf = new Uint8Array(merged)
      } else {
        if (this.ended) {
          throw new Error('stream ended')
        }
        await new Promise<void>((r) => {
          this.wait = r
        })
      }
    }
    const out = this.buf.subarray(0, n)
    this.buf = this.buf.subarray(n)
    return out
  }

  cancel() {
    this.ended = true
    if (this.wait) {
      this.wait()
      this.wait = null
    }
  }
}

export async function readDcFrame(reader: DataChannelReader): Promise<{
  frameType: number
  payload: Uint8Array
}> {
  const h = await reader.read(5)
  const { frameType, payloadByteLength: len } = parseDcFrameHeader(h)
  const payload = await reader.read(len)
  return { frameType, payload }
}
