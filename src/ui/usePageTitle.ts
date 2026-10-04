import { useEffect } from 'react'

/** Every screen names itself in the tab and the history list (ux-spec 0.1): "Jobs: Nod". */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}
