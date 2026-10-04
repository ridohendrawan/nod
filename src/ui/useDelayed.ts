import { useEffect, useState } from 'react'

/** True after `ms`: skeletons wait 200 ms, so fast responses never flash (design-system 5). */
export function useDelayed(ms = 200): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return shown
}
