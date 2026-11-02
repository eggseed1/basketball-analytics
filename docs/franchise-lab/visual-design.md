# Franchise Lab visual system

Franchise Lab is a DRBL tool first and a franchise game second. The outer shell should use DRBL's semantic canvas, glass/card elevation, restrained borders, even-pixel typographic scale and neutral content surfaces in both light and dark mode. Basketball team color is an identity mark and selection cue, not a full-screen background or top border on every card.

## Patterns adapted from sports franchise games

- **NBA 2K MyNBA:** predictable franchise management desks, continuous multi-season progression, visible league identity and standings, postseason matchups as a navigable bracket.
- **Madden Franchise:** action-first hub and contextual next decision instead of exposing everything at equal prominence; navigation between roster, coaching and league management without leaving context.
- **DRBL:** light and dark theme parity, readable numerical hierarchy, dense but scannable stat tables, subtle surface elevations, mobile scroll containment and accessible focus.

This is a product pattern adaptation, not a reproduction of the games' artwork or proprietary interfaces.

## Shared behavior and guardrails

- **Shell:** a neutral identity panel, branded team rail, record and season context. Settings, fullscreen and save actions retain their original semantics.
- **Primary navigation:** Home stays first; Roster, Coaching, Development, Season hub and More remain reachable. Scroll the primary strip within its own container on narrow screens; More stays pinned.
- **Season priority:** call out the current season phase and the required decision; route to Season hub. Do not replace explicit advancement and confirmation steps with decorative interactions.
- **Surfaces:** do not recolor every card by club; preserve a single strong focus/selected state. Match the website's materials and radii rather than a bespoke game palette.
- **Data:** tabular score typography, sensible numeric prominence and horizontal containment for wide tables or brackets. Keep all scores and control labels accessible.
- **Responsive:** at 390px, no document-level horizontal overflow; the navigation and bracket manage their own scroll, action buttons wrap, and modal controls remain reachable.
- **Motion:** simple hover or focus shifts only, respecting reduced-motion user preferences.

All changes in this visual pass are deliberately presentation-only. League state, draft mechanics, player ratings, sim logic, contract rules and autosave semantics remain unchanged.
