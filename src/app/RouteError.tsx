// A screen crashed. Say so calmly, keep the way out obvious, and log the cause for us.
import { CircleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import { Button } from '../ui/Button.tsx'
import { ButtonLink } from '../ui/ButtonLink.tsx'
import { usePageTitle } from '../ui/usePageTitle.ts'

export function RouteError() {
  const error = useRouteError()
  usePageTitle('Something went wrong: Nod')
  useEffect(() => {
    console.error('Nod: a screen failed to render', error)
  }, [error])

  return (
    <div className="screen screen-glow screen-glow-soft">
      <main className="page page-builder full-state">
        <span className="state-mark" aria-hidden="true">
          <CircleAlert size={30} strokeWidth={2} />
        </span>
        <h1 tabIndex={-1} className="t-title-1">
          Something went wrong on this screen
        </h1>
        <p>Your work is saved.</p>
        <div className="stack-actions">
          <Button variant="primary" size={56} block onClick={() => window.location.reload()}>
            Try again
          </Button>
          <ButtonLink variant="outline" size={56} block to="/" reloadDocument>
            Back to your jobs
          </ButtonLink>
        </div>
      </main>
    </div>
  )
}
