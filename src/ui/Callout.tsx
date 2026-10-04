import {
  CircleAlert,
  CircleCheck,
  Clock,
  Info,
  MessageCircleQuestionMark,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Tone } from '../../shared/copy.ts'

const ICON: Record<Tone, LucideIcon> = {
  go: CircleCheck,
  wait: Clock,
  ask: MessageCircleQuestionMark,
  stop: CircleAlert,
  neutral: Info,
}

/** A tinted box with an icon and a title, so meaning never rides on colour alone. */
export function Callout({
  tone,
  title,
  children,
  action,
}: {
  tone: Tone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
}) {
  const Icon = ICON[tone]
  return (
    <div className={`callout callout-${tone}`}>
      <Icon className="callout-icon" size={22} aria-hidden="true" />
      <div className="callout-body">
        {title ? <p className="callout-title">{title}</p> : null}
        {children ? <div className="callout-text">{children}</div> : null}
        {action ? <div className="callout-action">{action}</div> : null}
      </div>
    </div>
  )
}
