// Queensland (D57, D89): QBCC Act 1991 (Qld), Sch 1B, ss 40-41, plus the s 70(2) premium warning.

import { auto, dateAsked, delay, description, premiumNote, price, required } from './common.ts'
import type { RuleSet } from './types.ts'

export const QLD: RuleSet = {
  id: 'qld-1991',
  state: 'QLD',
  name: 'Queensland',
  law: 'QBCC Act 1991 (Qld), Sch 1B, ss 40–41',
  effectiveFrom: '1991-01-01',
  checks(d, ctx, firstName) {
    const credit = d.price_cents !== null && d.price_cents < 0
    const checks = [
      description(d),
      dateAsked(d, ctx, firstName),
      delay(d),
      price(d, ctx, 'Price change, or how it’s worked out', { orMethod: true, showTotal: true }),
    ]
    // s 41(2)(f) and (g): when an increase is paid or a decrease accounted for. Not needed at
    // $0, but needed when the price is a method, because it will still go up or down.
    if (d.price_cents !== 0) {
      checks.push(
        required(
          'payment',
          credit ? 'When it’s credited' : 'When it’s paid',
          d.payment_timing !== null,
          'payment',
          credit ? 'Choose when it’s credited' : 'Choose when it’s paid',
        ),
      )
    }
    checks.push(
      auto('copy', `${firstName} gets a copy`, ctx.sent, 'When you send it'),
      // s 40(5): no work before her written agreement.
      auto(
        'written_ok',
        `${firstName}’s written OK before you start`,
        ctx.approved,
        `When ${firstName} approves`,
      ),
    )
    return checks
  },
  notes: (d) =>
    premiumNote(
      d,
      'This adds $5,000 or more. Pay the extra home warranty premium before starting this work.',
    ),
}
