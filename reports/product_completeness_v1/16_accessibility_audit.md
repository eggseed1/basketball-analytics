# 16 — Accessibility audit

**Method:** code inspection of identity/DRBL surfaces (not a full axe/WCAG certification run).

## Logo / mark `alt` text

| Component | Behavior | Assessment |
|---|---|---|
| `TeamLogo` | `<Image alt="">`; text fallbacks `aria-hidden` | Decorative when adjacent team name/link text exists — OK pattern; ensure parent link accessible name includes team |
| `HistoricalTeamMark` | Image `alt=""` | Same decorative pattern; monogram spans `aria-hidden` |
| `PlayerHeadshot` | `alt={name ? \`${name} headshot\` : ""}` | Named when name known — good |

**Gap:** if a logo appears without visible text, empty `alt` would hide the team — current explore/team tables pair logo with name text.

## Contrast

- Diff coloring on explore teams (`text-emerald-700` / `text-rose-700` on avgDiff) relies on hue **plus** numeric magnitude (sign encoded in the number) — not color-only for the value itself, but positive/negative cue is color-weighted.
- Muted helper copy (`text-muted-foreground`) is used heavily on banners and learn body — spot-check on light theme recommended; **not instrumented** this pass.
- Historical monograms set explicit `background` / `foreground` from era palette — contrast depends on palette entries; no automated AA check run.

## Color-only encoding

| Surface | Risk | Notes |
|---|---|---|
| Team avgDiff cell | Medium | Color class + signed number (number remains) |
| Scatter / charts | Mitigated where `sr-only` summaries / `aria-label` present (`player-usage-ts-scatter`) | Good precedent |
| DRBL Snapshot | Low | Numeric labels, not color scales |

## Other a11y notes observed

- Player destination sections expose `aria-label` regions (`Career`, `Seasons`, `Context`).
- Sortable heads / filter toolbars include `sr-only` live regions in explore players.
- Learn DRBL is static prose — keyboard OK; no interactive widget a11y regressions introduced.

## Verdict

No blocker found that undoes DRBL product fixes; **logo empty-alt is intentional decorative**. Full automated a11y suite and mobile screenshot contrast review remain **deferred** with UI smoke.
