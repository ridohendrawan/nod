// The time, to the minute, for the clocks drawn on the phones (the status bar, Sarah's lock
// screen). It turns over as each minute does, so a phone never reads 11:36 under "opened it at
// 11:37 pm", and it catches up as soon as the page is seen again: a background tab's timers sleep.
import { useEffect, useState } from 'react'

const MINUTE = 60_000

export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // A moment past the next minute, so the new minute has surely begun.
    const schedule = (from: number) => {
      clearTimeout(timer)
      timer = setTimeout(tick, MINUTE - (from % MINUTE) + 50)
    }
    function tick() {
      const at = new Date()
      setNow(at)
      schedule(at.getTime())
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') tick()
    }
    schedule(Date.now())
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [])
  return now
}
