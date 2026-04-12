import { toString } from 'uint8arrays'

/**
 * Parses the JSON hello body after the frame type has been verified as JSON.
 * @throws {Error} invalid hello
 */
export function parseHelloJsonPayload(payload: Uint8Array): { logicalId: string } {
  const hello = JSON.parse(toString(payload)) as {
    type?: string
    logicalId?: string
  }
  if (hello.type !== 'hello' || !hello.logicalId) {
    throw new Error('invalid hello')
  }
  return { logicalId: hello.logicalId }
}
