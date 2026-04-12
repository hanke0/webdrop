export type PendingBooleanResponse = {
  resolve: (accepted: boolean) => void
  promiseReject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function clearPendingBooleanResponses(
  map: Map<string, PendingBooleanResponse>,
  err: Error
): void {
  for (const [key, p] of [...map.entries()]) {
    clearTimeout(p.timer)
    map.delete(key)
    p.promiseReject(err)
  }
}
