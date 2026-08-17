# Existing advanced-stat Learn pattern

## Route pattern

- Flat App Router: `/learn/[slug]`
- Dedicated portals allowed: `/learn/drbl` (custom `page.tsx`)
- Guides resolve via `STAT_GUIDES` → `StatGuideView`
- Topics resolve via `LEARN_TOPICS` → `LearnTopicView`
- Registry Level-1 tooltips: `LEARN_CONCEPTS` + `MetricHelp`

## Reference pages audited

| Metric | Route | Kind |
|--------|-------|------|
| DARKO | `/learn/darko` | StatGuide |
| LEBRON | `/learn/lebron` | StatGuide |
| True shooting | `/learn/true-shooting` | StatGuide |
| CPI / Career Resume | `/learn/cpi`, `/learn/career-resume` | LearnTopic |

## Shared structure (StatGuide)

1. Category eyebrow
2. Title + one-line blurb
3. Plain / Full depth toggle
4. Plain: teaches / doesn’t / upsides / downsides / apply
5. Deep: definition + formula + calculation steps + same sections + sources
6. Related concepts + See it in DRBL (from registry)
7. More in Learn chips

## Shared structure (LearnTopic)

1. One sentence
2. Why it matters
3. How to interpret
4. How DRBL uses it
5. Optional formula / calculation
6. Caveats
7. Related + see in action

## Heading hierarchy

- `h1` concept name
- `h2` section titles (What it teaches, Definition, …)
- Monospace formula block only in deep / technical sections

## Mobile

- Single column `site-prose` / max-width shell
- Depth toggle remains thumb-friendly
- Related chips wrap

## DRBL implementation choice

DRBL metrics use **StatGuide** (same as DARKO/TS) for metric pedagogy.
Methodology systems (how-it-works, validation, historical, limitations) use **LearnTopic**.
Overview portal remains custom `/learn/drbl` for casual “two numbers” framing.
