// A changing total counts up (D75), so Dan sees the money move when Sarah approves. Only when
// the value changes, never on first render; with reduced motion it jumps straight there.
// Screen readers get the final value from hidden text beside the animated number.
import { useEffect, useState } from 'react'

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function useCountUp(target: number, { duration = 600, delay = 150 } = {}): number {
  const [settled, setSettled] = useState(target)
  const [value, setValue] = useState(target)
  const [run, setRun] = useState<{ from: number; to: number } | null>(null)

  // The target moved: start from whatever is on screen now (React's "adjust state when a prop
  // changes" pattern, so the old number never flashes the new one first).
  if (target !== settled) {
    setSettled(target)
    if (reduceMotion()) {
      setRun(null)
      setValue(target)
    } else {
      setRun({ from: run ? value : settled, to: target })
    }
  }

  const from = run?.from
  const to = run?.to
  useEffect(() => {
    if (from === undefined || to === undefined) return
    let raf = 0
    const t0 = performance.now() + delay
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / duration))
      setValue(Math.round(from + (to - from) * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setRun(null)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [from, to, duration, delay])

  return run ? value : target
}
