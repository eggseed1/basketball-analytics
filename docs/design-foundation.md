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

## Dark mode color
- Neutrals share one cool hue (OKLCH h≈268, chroma ≤0.012) and step evenly in lightness per elevation: canvas 0.16, card 0.21, raised 0.25, secondary 0.27, active 0.315. No pure black canvas; glass needs something to sample and white text halos on #000.
- Text is off-white (L0.955, 15:1 on card); muted text L0.735 (7.5:1).
- Glass veils are solved against their backdrop: 72% `--glass-rgb` over the canvas lands on `--card`. Every glass surface (`.sports-card`, `GlassSurface`, `.bg-card` under glass) uses `--material-standard-bg`, never its own alpha. Opaque washes mixed from `--card` then sit flush inside glass with no brightness seam.
- Brand colors on dark are lifted in OKLCH lightness (`liftForDarkSurface`), keeping hue and chroma. Never mix toward white; that turns navies and purples chalky.
- Big color fields (page atmosphere) use lower chroma than light mode, and radial gradients get an eased mid stop so they don't band.
- Colors built in TS for inline styles use `surfaceColor(rgb, "auto")`, which resolves per theme through `--surface-dark-mix`. SVG attributes take an explicit surface instead.
- A tinted band inside a panel (team wash header) fades into the panel body with a mask. It never ends on a hard edge.

## Two-side team color
When a surface washes from one team color to another (`.matchup-wash`, `.score-card-wash`, split bars), each side's identity sits on its own color. Player A's face or team A's logo goes on the left with A's color; B's goes on the right with B's color. Never group both faces on one side of a two-color wash. Numbers and labels follow the same order (A left, B right).

## Headshots in rings
A headshot inside a colored ring fills the ring exactly: the ring wrapper is block or flex (not inline, which leaves a line-height gap at the bottom), padding is even on all sides, and the inner `PlayerHeadshot` drops its default white ring (`ring-0`) so only one ring shows.

## Liquid glass
`react-liquid-glass-svg` **not** installed in MERGE.1 (optional/deferred).
