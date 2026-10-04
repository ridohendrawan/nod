// The menu (ux-spec 1): reset the demo, pretend the AI is down (D21), and what Nod is.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, RotateCcw, ZapOff } from 'lucide-react'
import { useState, type RefObject } from 'react'
import type { SessionResponse } from '../../shared/types.ts'
import { SESSION_KEY, useShell } from '../app/shell.ts'
import { announce } from '../lib/announce.ts'
import { api } from '../lib/api.ts'
import { MenuItem } from '../ui/MenuItem.tsx'
import { ConfirmSheet, Sheet } from '../ui/Sheet.tsx'
import { Switch } from '../ui/Switch.tsx'
import { useToasts } from '../ui/toastContext.ts'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The Menu button: where focus goes back to after any sheet opened from here. */
  trigger: RefObject<HTMLButtonElement | null>
}

export function MenuSheet({ open, onOpenChange, trigger }: Props) {
  const { session } = useShell()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const reset = useResetDemo(() => setConfirmOpen(false))
  const aiDown = useAiDown()

  // One sheet at a time: the menu closes as the next one opens.
  const openFromMenu = (openNext: () => void) => {
    onOpenChange(false)
    openNext()
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title="Menu">
        <ul className="menu-list">
          <li>
            <MenuItem
              icon={<RotateCcw size={20} strokeWidth={2.25} />}
              label="Reset demo data"
              hint="The three jobs go back to how they started."
              onClick={() =>
                openFromMenu(() => {
                  reset.clearError()
                  setConfirmOpen(true)
                })
              }
            />
          </li>
          <li>
            <Switch
              icon={
                <span className="menu-tile is-amber" aria-hidden="true">
                  <ZapOff size={20} strokeWidth={2.25} />
                </span>
              }
              label="Pretend the AI is down"
              hint="For demos. Nod skips the AI so you can show the by-hand path."
              checked={session?.workspace.ai_down ?? false}
              onCheckedChange={(next) => aiDown.mutate(next)}
            />
          </li>
          <li>
            <MenuItem
              icon={<Info size={20} strokeWidth={2.25} />}
              label="About Nod"
              hint="How the AI, the rules and you share the work."
              onClick={() => openFromMenu(() => setAboutOpen(true))}
            />
          </li>
        </ul>
      </Sheet>

      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset the demo?"
        consequence="The three jobs go back to how they started. Changes you’ve recorded or sent are deleted, and links you’ve sent stop working."
        confirmLabel="Reset demo data"
        pending={reset.isPending}
        error={reset.error}
        onConfirm={reset.run}
        finalFocus={trigger}
      />

      <Sheet
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        title="About Nod"
        description="Nod splits the work three ways."
        finalFocus={trigger}
      >
        <div className="sheet-prose">
          <ol className="about-steps">
            <li>
              <p>
                <b>The AI drafts</b>
                <span>
                  It turns what you say on site into a variation, with plain words for your client.
                  It never sets a price.
                </span>
              </p>
            </li>
            <li>
              <p>
                <b>The rules check</b>
                <span>
                  Plain code checks each draft against what your state’s law asks a variation to
                  include.
                </span>
              </p>
            </li>
            <li>
              <p>
                <b>You decide</b>
                <span>
                  You set the price and send it. Your client approves, asks a question or says no.
                </span>
              </p>
            </li>
          </ol>
          <p className="fine-print">Nod checks the content. It isn’t legal advice.</p>
        </div>
      </Sheet>
    </>
  )
}

const RESET_FAILED = 'That didn’t go through. Nothing was reset. Try again.'

/**
 * Reset, and say so once. The write pokes every open view, this tab included, and the event feed
 * turns the `reset` event into the one "Demo data reset." toast everywhere (ids handled once).
 */
function useResetDemo(onDone: () => void) {
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: api.resetDemo,
    onSuccess: () => onDone(),
    onError: () => {
      setError(RESET_FAILED)
      announce(RESET_FAILED)
    },
  })

  return {
    run: () => {
      setError(null)
      mutation.mutate()
    },
    isPending: mutation.isPending,
    error,
    clearError: () => setError(null),
  }
}

/** The demo switch. It flips at once and flips back if the store didn't take it. */
function useAiDown() {
  const queryClient = useQueryClient()
  const { show } = useToasts()
  const setAiDown = (aiDown: boolean) =>
    queryClient.setQueryData<SessionResponse>(SESSION_KEY, (old) =>
      old ? { ...old, workspace: { ...old.workspace, ai_down: aiDown } } : old,
    )

  return useMutation({
    mutationFn: api.setAiDown,
    onMutate: (next) => {
      const previous = queryClient.getQueryData<SessionResponse>(SESSION_KEY)?.workspace.ai_down
      setAiDown(next)
      return { previous }
    },
    onSuccess: (data) => setAiDown(data.ai_down),
    onError: (_error, _next, context) => {
      if (context?.previous !== undefined) setAiDown(context.previous)
      show('That didn’t save. Try again.')
    },
  })
}
