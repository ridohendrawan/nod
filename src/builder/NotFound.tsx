import { Compass } from 'lucide-react'
import { ButtonLink } from '../ui/ButtonLink.tsx'
import { usePageTitle } from '../ui/usePageTitle.ts'
import { AppHeader, Brand } from './AppHeader.tsx'

export function NotFound() {
  usePageTitle('Page not found: Nod')
  return (
    <div className="screen screen-glow screen-glow-soft">
      <AppHeader left={<Brand />} />
      <main className="page page-builder full-state">
        <span className="state-mark" aria-hidden="true">
          <Compass size={30} strokeWidth={2} />
        </span>
        <h1 tabIndex={-1} className="t-title-1">
          This page doesn’t exist
        </h1>
        <p>The link may be old or mistyped.</p>
        <ButtonLink variant="primary" size={56} block to="/">
          Back to your jobs
        </ButtonLink>
      </main>
    </div>
  )
}
