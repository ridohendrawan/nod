import type { ReactNode } from 'react'
import { Button } from './Button.tsx'

/** A screen's data didn't load: say what, and offer the retry right there. */
export function LoadError({
  message,
  retrying,
  onRetry,
  children,
}: {
  message: string
  retrying: boolean
  onRetry: () => void
  /** Another way out, under Try again. */
  children?: ReactNode
}) {
  return (
    <div className="load-error">
      <p>{message}</p>
      <div className="stack-actions">
        <Button variant="outline" size={56} block pending={retrying} onClick={onRetry}>
          Try again
        </Button>
        {children}
      </div>
    </div>
  )
}
