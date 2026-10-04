// Bottom sheets on Base UI's Drawer (D43): focus trap, Esc, focus return, scroll lock and swipe
// to dismiss. Base UI hides the page with aria-hidden but leaves live regions alone, so the
// announcer and toasts keep working while a sheet is open (research/stack.md 2.5).
import { Drawer } from '@base-ui/react/drawer'
import { CircleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { Button } from './Button.tsx'
import { revealIfOffScreen } from './reveal.ts'

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** A mark before the title, like the nod tick on "Ready for Sarah". Decorative. */
  titleIcon?: ReactNode
  /** A line under the title, read as the sheet's description. */
  description?: ReactNode
  /** Sheets with inputs keep fields above the iOS keyboard and never close on a backdrop tap. */
  hasFields?: boolean
  /** Where focus starts. Default: the heading, so the sheet is read from the top (D43). */
  initialFocus?: RefObject<HTMLElement | null>
  /** Where focus lands after closing. Default: whatever opened the sheet. */
  finalFocus?: RefObject<HTMLElement | null>
  children?: ReactNode
}

export function Sheet({
  open,
  onOpenChange,
  title,
  titleIcon,
  description,
  hasFields,
  initialFocus,
  finalFocus,
  children,
}: SheetProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const body = (
    <Drawer.Content className="sheet-content">
      <div className="sheet-head">
        {titleIcon ? (
          <span className="sheet-title-icon" aria-hidden="true">
            {titleIcon}
          </span>
        ) : null}
        <Drawer.Title ref={titleRef} className="sheet-title t-title-2" tabIndex={-1}>
          {title}
        </Drawer.Title>
        <Drawer.Close className="icon-btn sheet-close" aria-label="Close">
          <X size={24} aria-hidden="true" />
        </Drawer.Close>
      </div>
      {description ? (
        <Drawer.Description className="sheet-description">{description}</Drawer.Description>
      ) : null}
      {children}
    </Drawer.Content>
  )
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) revealReturnedFocus()
      }}
      swipeDirection="down"
      disablePointerDismissal={hasFields}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="sheet-scrim" />
        <Drawer.Viewport className="sheet-viewport">
          <Drawer.Popup
            className="sheet"
            initialFocus={initialFocus ?? titleRef}
            finalFocus={finalFocus ?? true}
          >
            {/* The handle sits outside Content: only touches on it (or outside Content) drag. */}
            <div className="sheet-handle" aria-hidden="true" />
            {hasFields ? (
              <Drawer.VirtualKeyboardProvider>{body}</Drawer.VirtualKeyboardProvider>
            ) : (
              body
            )}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/** Base UI hands focus back once the closed sheet has unmounted, without scrolling. A frame
 *  later, make sure it isn't out of sight (wait a few more while it's still in a sheet). */
function revealReturnedFocus(framesLeft = 5) {
  requestAnimationFrame(() => {
    const el = document.activeElement
    if (framesLeft > 0 && el?.closest('.sheet')) revealReturnedFocus(framesLeft - 1)
    else revealIfOffScreen(el)
  })
}

/** A short list of actions at the foot of a sheet, stacked full width. */
export function SheetActions({ children }: { children: ReactNode }) {
  return <div className="sheet-actions">{children}</div>
}

type ConfirmSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** One line: what happens if you go ahead. */
  consequence: ReactNode
  /** Specific, never "OK": "Reset demo data", "Withdraw Variation 2". */
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  pending?: boolean
  /** Shown above the buttons when the action failed. The caller announces it once (D79). */
  error?: string | null
  onConfirm: () => void
  /** Where focus lands once the action is done (it often changes what's on screen). Cancelling
   *  always goes back to whatever opened the sheet. */
  finalFocus?: RefObject<HTMLElement | null>
}

/** Confirm anything another person will see, with the consequence spelled out (D72). */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel,
  cancelLabel = 'Keep it',
  danger = true,
  pending,
  error,
  onConfirm,
  finalFocus,
}: ConfirmSheetProps) {
  // A cancel (the button, Esc, the close button, a tap outside) comes through onOpenChange; once
  // the action is done the caller closes the sheet itself. Only then does focus go to finalFocus.
  const cancelled = useRef(false)
  useEffect(() => {
    if (open) cancelled.current = false
  }, [open])
  const afterClose = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return cancelled.current ? null : (finalFocus?.current ?? null)
      },
    }),
    [finalFocus],
  )
  const cancel = (next: boolean) => {
    if (!next) cancelled.current = true
    onOpenChange(next)
  }
  return (
    <Sheet
      open={open}
      onOpenChange={cancel}
      title={title}
      description={consequence}
      finalFocus={finalFocus ? afterClose : undefined}
    >
      {error ? (
        <p className="sheet-error">
          <CircleAlert size={20} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      <SheetActions>
        <Button
          variant={danger ? 'danger' : 'primary'}
          size={56}
          block
          pending={pending}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button variant="outline" size={56} block onClick={() => cancel(false)}>
          {cancelLabel}
        </Button>
      </SheetActions>
    </Sheet>
  )
}
