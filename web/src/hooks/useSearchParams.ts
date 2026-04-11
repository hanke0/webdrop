import { useState } from 'react'

export function useSearchParams() {
  const [searchQuery] = useState(() => new URLSearchParams(window.location.search))
  return searchQuery
}
