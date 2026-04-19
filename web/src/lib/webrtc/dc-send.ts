const MAX_BUFFERED = 8 * 1024 * 1024
const LOW_WATER = MAX_BUFFERED / 2

function waitForDrain(ch: RTCDataChannel): Promise<void> {
  return new Promise((resolve) => {
    ch.addEventListener('bufferedamountlow', () => resolve(), { once: true })
  })
}

/**
 * Stream a Blob over a data channel in chunks, reading one slice at a time so
 * large files never materialise the whole buffer in memory. Throttles against
 * `bufferedAmount` to avoid unbounded growth in the send queue.
 */
export async function sendBlobChunks(
  ch: RTCDataChannel,
  blob: Blob,
  chunkSize: number
): Promise<void> {
  ch.bufferedAmountLowThreshold = LOW_WATER
  let offset = 0
  while (offset < blob.size) {
    if (ch.readyState !== 'open') {
      throw new Error('file channel closed')
    }
    while (ch.bufferedAmount > MAX_BUFFERED) {
      await waitForDrain(ch)
      if (ch.readyState !== 'open') {
        throw new Error('file channel closed')
      }
    }
    const end = Math.min(offset + chunkSize, blob.size)
    const slice = blob.slice(offset, end)
    const buf = await slice.arrayBuffer()
    ch.send(buf)
    offset = end
  }
}
