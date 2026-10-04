import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import '../styles/fonts.css'
import '../styles/tokens.css'
import '../styles/base.css'
import '../styles/components.css'
import '../styles/screens.css'
import '../styles/forms.css'
import '../styles/owner.css'
import '../styles/review.css'
import '../styles/phone.css'
import '../styles/stage.css'
import { clickByName } from '../ui/clickByName.ts'
import { DemoStage } from './DemoStage.tsx'
import { DESKTOP_QUERY, inFrame, onStage, wantsStage } from './frame.ts'
import { queryClient } from './queryClient.ts'
import { createRouter } from './router.tsx'

// Development only: /?simulate=golden (or a sample's id) says a sample through the real voice code.
if (import.meta.env.DEV && location.search.includes('simulate=')) {
  const { installSimulatedSpeech } = await import('../dev/simulateSpeech.ts')
  installSimulatedSpeech()
}

// Inside a drawn phone, the page leaves room for its status bar and home indicator.
if (inFrame()) document.documentElement.dataset.frame = 'phone'
// Dan's phone on the demo stage: "Text it to Sarah" texts the phone beside it (D24).
if (onStage()) document.documentElement.dataset.stage = 'builder'

const root = document.getElementById('root')
if (!root) throw new Error('Nod: the page has no #root element.')

// A preview link (/screens/<name>, src/app/preview) sets up one screen by itself, at phone size,
// for a design tool to import. It never shows the stage. Null: it drew its own page (the list of
// screens), or Sarah's page is opening instead.
const previewing = /^\/screens(\/|$)/.test(location.pathname)
const preview = previewing ? await (await import('./preview/screens.ts')).runPreview() : undefined

// On a computer this page is the demo stage: Dan's app and Sarah's page run in the phones it draws.
const stage = !previewing && wantsStage()

if (preview !== null) {
  if (stage) {
    createRoot(root).render(
      <StrictMode>
        <DemoStage />
      </StrictMode>,
    )
  } else {
    const router = createRouter()
    createRoot(root).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    )
    // A preview's sheet or step (the menu, What Sarah sees, a sample note) opens through its button.
    if (preview) void clickByName(preview.press)
  }
}

// A window resized across the line between phone and computer swaps layouts, once it settles.
// Everything is saved as Dan goes (the store, the note, autosave), so a reload loses nothing.
if (!inFrame() && !previewing) {
  let timer: ReturnType<typeof setTimeout> | undefined
  window.matchMedia(DESKTOP_QUERY).addEventListener('change', () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (wantsStage() !== stage) location.reload()
    }, 400)
  })
}
