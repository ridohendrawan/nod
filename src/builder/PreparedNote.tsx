// D95: the public demo has no AI key, so the five sample notes get results prepared in advance.
// Each result from one says so, in a quiet line (never a warning), so nobody takes it for live AI.
import { Info } from 'lucide-react'

export function PreparedNote({ children }: { children: string }) {
  return (
    <p className="prepared-note">
      <Info size={16} strokeWidth={2.25} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}
