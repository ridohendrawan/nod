// Dan's routes (ux-spec 0.1), in React Router's data mode (D41): scroll restoration and route
// error screens come with it. Sarah's page is a separate HTML file (D86), so it isn't here.
import { createBrowserRouter } from 'react-router'
import { JobScreen } from '../builder/JobScreen.tsx'
import { JobsScreen } from '../builder/JobsScreen.tsx'
import { NotFound } from '../builder/NotFound.tsx'
import { RecordScreen } from '../builder/record/RecordScreen.tsx'
import { VariationRoute } from '../builder/variation/VariationScreen.tsx'
import { BuilderShell } from './BuilderShell.tsx'
import { DemoStage } from './DemoStage.tsx'
import { RouteError } from './RouteError.tsx'

/** Made only when Dan's app runs here (not on a computer's demo stage, which frames it instead). */
export const createRouter = () =>
  createBrowserRouter([
    // The demo stage lays out both phones itself, outside Dan's shell (ux-spec 8).
    { path: 'demo', Component: DemoStage, ErrorBoundary: RouteError },
    {
      Component: BuilderShell,
      ErrorBoundary: RouteError, // the shell itself failed
      children: [
        {
          ErrorBoundary: RouteError, // a screen failed: the shell, its toasts and its feed carry on
          children: [
            { index: true, Component: JobsScreen },
            { path: 'job/:id', Component: JobScreen },
            { path: 'job/:id/new', Component: RecordScreen },
            { path: 'v/:id', Component: VariationRoute },
            // Development only: the component gallery, never in a production build.
            ...(import.meta.env.DEV
              ? [
                  {
                    path: 'dev/ui',
                    lazy: {
                      Component: async () => (await import('../dev/UiGallery.tsx')).UiGallery,
                    },
                  },
                ]
              : []),
            { path: '*', Component: NotFound },
          ],
        },
      ],
    },
  ])
