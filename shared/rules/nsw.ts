// New South Wales (D22, D56). The Act itself only asks for writing signed by both parties
// (Home Building Act 1989 (NSW), Sch 2, cl 1(2), through s 7E). Every other item comes from
// NSW Government guidance, and the footer says so.

import { auto, delay, description, hasText, newTotal, optional, price } from './common.ts'
import type { RuleSet } from './types.ts'

export const NSW: RuleSet = {
  id: 'nsw-1989',
  state: 'NSW',
  name: 'New South Wales',
  law: 'Home Building Act 1989 (NSW), Sch 2, cl 1(2)',
  guidanceNote: 'Other items: NSW Government guidance',
  effectiveFrom: '1990-01-01',
  checks: (d, ctx, firstName) => [
    description(d),
    price(d, ctx, 'Price or credit'),
    newTotal(d, ctx),
    delay(d, 'Extra days (0 is fine)'),
    optional('plans', 'Plans or specs, if any', d.photo_id !== null, 'photo'),
    optional('price_method', 'How the price adds up', hasText(d.price_method), 'price_method'),
    // The statutory item (D22): pending until Sarah signs, never a tick at send time.
    auto('signed', 'Signed by you both', ctx.approved, `When ${firstName} signs`),
  ],
  notes: () => [],
}
