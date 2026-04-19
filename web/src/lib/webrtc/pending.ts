export type PendingBooleanResponse = {
  resolve: (v: boolean) => void
  promiseReject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function clearPendingBooleanResponses(
  map: Map<string, PendingBooleanResponse>,
  err: Error
): void {
  for (const [, p] of map) {
    clearTimeout(p.timer)
    p.promiseReject(err)
  }
  map.clear()
}
