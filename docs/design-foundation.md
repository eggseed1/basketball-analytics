# MERGE.1 Design Foundation Contract

## Tokens
- Even-px type scale via `@theme` + `.type-*` roles
- Surface modes: `html[data-surface="glass"]` (default) vs solid (attribute absent)
- Color schemes: light / dark / system (owner theme)

## Surfaces (hierarchy)
1. PAGE BACKGROUND (+ optional `.page-atmosphere`)
2. BASE / RAISED (`.sports-card` solid mode or opaque panels)
3. GLASS PANEL (`.glass-surface`, `.sports-card` under glass, `.glass-card`)
4. FLOATING FROST (`.hover-frost`, `FrostFloatingSurface`)
5. INTERACTIVE HOVER

**Nesting policy:** at most one glass layer between page and content; no glass-in-glass-in-glass. Dense lists/tables use `.board-scroll-host` (no stacked blur).

## Typography
Geist + Geist Mono only. Roles: display, page, heading, title, body, bodySm, caption. Numeric: `.score-num` / `tabular-nums`.

## Glass contrast (P0)
Glass fills raised vs Hannah tip (≈42%/22%) to ≈68–78% for readable primary/secondary text while retaining frost character.

## Controls
Buttons, pills, glass pills, tabs (active glass pill), search field, theme switch — focus-visible rings required.

## Capability / null language
`CapabilityStateBadge` / `CapabilityStatePanel`: supported | partial | unavailable | empty  
`NullDisplay`: zero | dash | unavailable | unknown — never conflate 0 with unavailable.

## Shell
Server `RootLayout` → `OwnerThemeProvider` island → `SportsShell` (client nav) with `SiteChrome` glass header. Product route IA preserved. `/internal/design-system` is NODE_ENV≠production only. No public `/luka`.

## Liquid glass
`react-liquid-glass-svg` **not** installed in MERGE.1 (optional/deferred).
