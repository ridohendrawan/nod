// "What Sarah sees" (ux-spec 4): her real card, built from the working copy as Dan types, with
// her buttons drawn but inert. "Edit Sarah's wording" turns it into fields; Done saves them and
// marks her wording as checked against his (D19).
import { PencilLine } from 'lucide-react'
import type { OwnerCard as Card } from '../../../shared/owner.ts'
import { Button } from '../../ui/Button.tsx'
import { TextArea } from '../../ui/Field.tsx'
import { OwnerActions, OwnerCard } from '../../ui/OwnerCard.tsx'
import { Sheet, SheetActions } from '../../ui/Sheet.tsx'
import { LIMITS, type Working } from './working.ts'

export type PreviewMode = 'view' | 'edit'

export function WhatSarahSees({
  mode,
  onClose,
  onEdit,
  onDone,
  card,
  photoUrl,
  w,
  set,
  firstName,
}: {
  /** Closed when null. */
  mode: PreviewMode | null
  onClose: () => void
  onEdit: () => void
  onDone: () => void
  card: Card
  photoUrl: string | null
  w: Working
  set: (patch: Partial<Working>) => void
  firstName: string
}) {
  const editing = mode === 'edit'
  // Her lines, numbered as she'll read them: only lines with words in them.
  const lines = w.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.text.trim() || item.owner_text.trim())
  return (
    <Sheet
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`What ${firstName} sees`}
      description={
        editing
          ? `Write it the way ${firstName} would say it. Leave a box empty to use your own words.`
          : `This is exactly what ${firstName}’s page will show.`
      }
      hasFields={editing}
    >
      {editing ? (
        <div className="owner-wording">
          <TextArea
            label={`Title ${firstName} reads`}
            value={w.owner_title}
            placeholder={w.title}
            rows={2}
            maxLength={LIMITS.title}
            className="title-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
            onChange={(e) => set({ owner_title: e.target.value.replace(/\s*\n+\s*/g, ' ') })}
          />
          {lines.map(({ item, index }, n) => (
            <TextArea
              key={index}
              label={`Item ${n + 1} for ${firstName}`}
              value={item.owner_text}
              placeholder={item.text}
              rows={2}
              maxLength={LIMITS.text}
              onChange={(e) =>
                set({
                  items: w.items.map((it, i) =>
                    i === index ? { ...it, owner_text: e.target.value } : it,
                  ),
                })
              }
            />
          ))}
          <TextArea
            label={`Why, for ${firstName}`}
            value={w.owner_reason ?? ''}
            placeholder={w.reason ?? ''}
            rows={2}
            maxLength={LIMITS.text}
            onChange={(e) => set({ owner_reason: e.target.value || null })}
          />
          <SheetActions>
            <Button variant="primary" size={56} block onClick={onDone}>
              Done
            </Button>
          </SheetActions>
        </div>
      ) : (
        <div className="owner-preview">
          <OwnerCard card={card} headingLevel={3} photoUrl={photoUrl} />
          <OwnerActions builderName={card.builder_name} inert />
          <SheetActions>
            <Button
              variant="outline"
              size={56}
              block
              icon={<PencilLine size={20} strokeWidth={2.25} aria-hidden="true" />}
              onClick={onEdit}
            >
              Edit {firstName}’s wording
            </Button>
          </SheetActions>
        </div>
      )}
    </Sheet>
  )
}
