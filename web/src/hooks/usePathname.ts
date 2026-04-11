import { useState } from 'react'

export function usePathname() {
  const [pathname] = useState(window.location.pathname)
  return pathname
}
