// The demo stage (ux-spec 8; D24): Dan's phone and Sarah's phone side by side. Every computer gets
// it at any of Dan's addresses but the preview links (ux-spec 0.5 and 0.6), for the public link,
// the recording and the live discussion. Both phones run in this one browser (D91), so they share
// its data. Dan's "Text it to Sarah" posts `nod:sent` up here, and Sarah's lock screen shows the
// text as a notification; tapping it opens her page in her phone.
import { MessageCircle, RotateCcw, Smartphone } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatToday } from '../../shared/time.ts'
import { announce } from '../lib/announce.ts'
import { api } from '../lib/api.ts'
import { PhoneFrame } from '../ui/PhoneFrame.tsx'
import { useMinute } from '../ui/useMinute.ts'
import { usePageTitle } from '../ui/usePageTitle.ts'
import { STAGE_TIME_ZONE, stageStart } from './frame.ts'

/** What Dan's app posts up when he texts Sarah on the stage (D24). */
export type SentMessage = { type: 'nod:sent'; link: string; text: string; sender: string }

const isSentMessage = (data: unknown): data is SentMessage => {
  const d = data as Partial<SentMessage> | null
  return (
    d?.type === 'nod:sent' &&
    typeof d.link === 'string' &&
    ownerPath(d.link) !== null &&
    typeof d.text === 'string' &&
    typeof d.sender === 'string'
  )
}

/** The path of one of Sarah's links on this site, or null: her phone opens nothing else. */
function ownerPath(link: string): string | null {
  try {
    const url = new URL(link)
    return url.origin === location.origin && url.pathname.startsWith('/o/') ? url.pathname : null
  } catch {
    return null
  }
}

type Note = SentMessage & { id: number; at: number }

// The two phones at their natural size: 390 x 780 screens with a 12 px bezel, a label above.
const NATURAL = { width: 414 * 2 + 72, height: 804 + 40 }

export function DemoStage() {
  usePageTitle('Nod demo stage')
  const dan = useRef<HTMLIFrameElement>(null)
  const [danStart] = useState(stageStart)
  const [notes, setNotes] = useState<Note[]>([])
  const [sarahAt, setSarahAt] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const nextId = useRef(1)

  // Dan's app says it texted Sarah: only from the left phone, only this site, only that shape.
  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== location.origin || event.source !== dan.current?.contentWindow) return
      if (!isSentMessage(event.data)) return
      const message = event.data
      setNotes((list) => [{ ...message, id: nextId.current++, at: Date.now() }, ...list])
      announce(`Sarah’s phone: a text from ${message.sender}.`)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const resetSarah = () => {
    setNotes([])
    setSarahAt(null)
  }

  const resetData = async () => {
    setResetting(true)
    try {
      await api.resetDemo()
      resetSarah()
    } finally {
      setResetting(false)
    }
  }

  // Scale the two phones to fit the window; the apps inside still render at 390 px.
  const stage = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => {
      // The room is the window below the controls; its padding isn't room for phones.
      const style = getComputedStyle(el)
      const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const height =
        el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      setScale(Math.min(1, width / NATURAL.width, height / NATURAL.height))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="stage">
      {/* Named, so they stand apart from the header and main inside each phone. */}
      <header className="stage-head" aria-label="Demo controls">
        <p className="stage-name">Nod demo stage</p>
        <div className="stage-controls">
          <button type="button" className="stage-btn" onClick={resetSarah}>
            <Smartphone size={18} strokeWidth={2.25} aria-hidden="true" />
            Reset Sarah’s phone
          </button>
          <button
            type="button"
            className="stage-btn"
            aria-busy={resetting || undefined}
            onClick={() => void resetData()}
          >
            <RotateCcw size={18} strokeWidth={2.25} aria-hidden="true" />
            {resetting ? 'Resetting…' : 'Reset demo data'}
          </button>
        </div>
      </header>
      <main className="stage-room" ref={stage} aria-label="The two phones">
        <h1 className="visually-hidden">Nod demo stage</h1>
        <div
          className="stage-phones"
          style={{ transform: `scale(${scale})`, height: NATURAL.height * scale }}
        >
          <section className="stage-side" aria-label="Dan’s phone">
            <p className="stage-label">Dan</p>
            <PhoneFrame
              src={danStart}
              title="Dan’s phone: Nod"
              frameRef={dan}
              timeZone={STAGE_TIME_ZONE}
            />
          </section>
          <section className="stage-side" aria-label="Sarah’s phone">
            <p className="stage-label">Sarah</p>
            {sarahAt ? (
              <PhoneFrame
                src={sarahAt}
                title="Sarah’s phone: her page"
                timeZone={STAGE_TIME_ZONE}
              />
            ) : (
              <PhoneFrame timeZone={STAGE_TIME_ZONE} light>
                <LockScreen notes={notes} onOpen={(note) => setSarahAt(ownerPath(note.link))} />
              </PhoneFrame>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

/** Sarah's lock screen: Brisbane time, today, and Dan's texts as they arrive. */
function LockScreen({ notes, onOpen }: { notes: Note[]; onOpen: (note: Note) => void }) {
  const now = useMinute()
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: STAGE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const time = `${part('hour')}:${part('minute')}`

  return (
    <div className="lock">
      <p className="lock-date">{formatToday(now, STAGE_TIME_ZONE)}</p>
      <p className="lock-time">{time}</p>
      <ol className="lock-notes" aria-label="Notifications">
        {notes.map((note) => (
          <li key={note.id}>
            <button type="button" className="lock-note" onClick={() => onOpen(note)}>
              <span className="lock-note-app" aria-hidden="true">
                <MessageCircle size={18} strokeWidth={2.5} />
              </span>
              <span className="lock-note-body">
                <span className="lock-note-meta">
                  <span>Messages</span>
                  <span>now</span>
                </span>
                <span className="lock-note-from">{note.sender}</span>
                <span className="lock-note-text">{note.text}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {notes.length ? null : <p className="lock-quiet">No new messages</p>}
    </div>
  )
}
