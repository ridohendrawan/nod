import { STATE_NAME, type StateCode } from '../../shared/states.ts'

/** "QLD" on screen; "Queensland rules" to a screen reader. All caps only here (design-system 3). */
export function StateChip({
  state,
  spoken = 'rules',
}: {
  state: StateCode
  spoken?: 'rules' | 'name' | 'none'
}) {
  return (
    <span className="state-chip">
      <span aria-hidden={spoken === 'none' ? undefined : true}>{state}</span>
      {spoken === 'none' ? null : (
        <span className="visually-hidden">
          {spoken === 'rules' ? `${STATE_NAME[state]} rules` : STATE_NAME[state]}
        </span>
      )}
    </span>
  )
}
