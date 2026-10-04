# How I used AI to build Nod

**Tools.**

- **Claude Code** did the research, the plan and the build, with me deciding at each step. Research ran in parallel streams, and I had every load-bearing fact checked against primary sources: the state Acts and regulators for the law, and competitors' own pages for the market.
- **Two Claude Code sessions built at once:** one on the data layer, the rules and the AI function, one on the screens, with written ownership and git rules so neither overwrote the other.
- **Nod's own AI step uses Claude Sonnet 5.5:** one call per note, with a structured output schema. The public prototype runs in demo mode (prepared drafts for the five sample notes, labelled on screen). In my live demo, Claude drafts any note through Claude Code on my Mac. Everything after the draft is the same real code either way.

**Where AI sped me up.**

- Research across state law, speech recognition, the platform and accessibility, in hours instead of days, with every claim sourced.
- The rules engine and its tests, written straight from tables of statute.
- The guardrails, their fixtures and the end-to-end tests.

**Where it was wrong, and what I changed.**

- **Forced tool use.** The plan asked for it, and the current model rejects it. Nod uses structured outputs instead, with the same schema.
- **A court case cited the wrong way round.** So the story leans on the Acts themselves, not on case law.
- **Victoria's reform date had moved** (to 31 March 2027 at the latest). Only reading the amending Act caught it.
- **"Nobody does this" was wrong.** A competitor already captures variations by voice with e-signing. Nod's difference: the state rules in code, a quote check that stops the AI setting a price, Sarah's plain-English card, and an approval tied to a record number.
- **Copy written for the persona.** "Date she asked" assumed every client is a woman. The copy now uses the client's name.
- **Checks that looked stronger than they were.** An accessibility scan passed without measuring any contrast, and a test said focus was on a heading that was really 243 pixels off screen. Both now measure what matters.

**What I overrode.**

- The first design looked like every AI-built app, so I had it rebuilt around one number, real photos and data you can read at a glance.
- The first logo read as a checkbox. It became a smiling house, picked from four directions mocked at real sizes.
- I chose a browser-only prototype, so nothing can expire before the live Q&A.
- Code, not the model, owns the price: the quote check drops any amount Dan didn't say.
- No legal claim reached the rules without a second check against the Act.
- I chose demo mode over a live key for the public link: no bill or secret to manage, and the prepared drafts are labelled.
