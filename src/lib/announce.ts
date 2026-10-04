// The one screen-reader announcer (D79). The region lives in the HTML file, outside React, so
// it exists before any message. Clearing first lets a repeated message be read again.
let timer: ReturnType<typeof setTimeout> | undefined

export function announce(message: string): void {
  const region = document.getElementById('announcer')
  if (!region) return
  region.textContent = ''
  clearTimeout(timer)
  timer = setTimeout(() => {
    region.textContent = message
  }, 120)
}
