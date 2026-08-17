# 14 — Design System

**Verdict:** `WEB_DESIGN_INTENT_PRESERVED = YES` (integration seal / UI preservation report).

## Visual direction

Apple Sports–inspired **light** product UI (not dark-default).

From `src/app/globals.css` `:root` tokens (selected):

| Token | Value |
|---|---|
| `--background` | `#f2f2f7` |
| `--foreground` | `#1d1d1f` |
| `--card` | `#ffffff` |
| `--primary` | `#1d1d1f` |
| `--muted-foreground` | `#6e6e73` |
| `--border` | `#d2d2d7` |
| `--ring` / `--chart-1` | `#0071e3` |
| `--destructive` | `#ff3b30` |
| `--radius` | `0.375rem` |

Stack: Tailwind CSS v4 (`@import "tailwindcss"`), `tw-animate-css`, shadcn tailwind theme bridge.

## Product patterns preserved from web redesign

- ASK DRBL prominence in primary nav  
- Progressive player/team destination shells  
- Explore board health banners / soft-fail resilience  
- Sports-card visual language on explore boards  
- Time Machine / era theme routes  
- DRBL season support notice wired to registry copy  

## Analytics semantic overlays into redesign

- DRBL/100, R1 Points, R1 Win Equivalents columns + sort keys  
- Glossary / Learn DRBL copy aligned to sealed definitions  
- Season registry remains single source  

## Intentional tradeoffs

Analytics-era Savant-heavy player page composition is partially superseded by web progressive destination islands; DRBL values remain via overlay + learn/glossary routes. `player-usage-ts-scatter` retained alongside web chart stack.
