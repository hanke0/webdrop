/** Send large binary in slices, waiting when the channel buffer grows. */
export async function sendBinaryChunks(
  ch: RTCDataChannel,
  data: Uint8Array,
  chunkSize: number
): Promise<void> {
  const MAX_BUFFERED = 8 * 1024 * 1024
  let offset = 0
  while (offset < data.length) {
    if (ch.readyState !== 'open') {
      throw new Error('file channel closed')
    }
    while (ch.bufferedAmount > MAX_BUFFERED) {
      await new Promise<void>((resolve) => {
        ch.addEventListener('bufferedamountlow', () => resolve(), { once: true })
      })
    }
    const slice = data.subarray(offset, offset + chunkSize)
    ch.send(new Uint8Array(slice))
    offset += slice.length
  }
}
