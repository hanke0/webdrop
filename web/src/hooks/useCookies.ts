import { useState } from "react";

// useCookies returns a read-only object of key-value pairs of cookies
export function useCookies() {
  const [cookies] = useState(
    () => new Map(
      document.cookie.split('; ')
        .map(v => v.split(/=(.*)/s)
          .map(decodeURIComponent)) as [string, string][]
    )
  )
  return cookies
}
