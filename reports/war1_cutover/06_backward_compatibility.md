# Backward compatibility

## Learn
- `/learn/wins-above-r1` → 308/301 permanent redirect to `/learn/drbl/war1` (`next.config.ts`)
- `/learn/war1` → permanent redirect to `/learn/drbl/war1`
- `getStatGuide("wins-above-r1")` resolves war1 guide content

## Sort
- `?sort=r1WinEquivalents` retained
- `?sort=r1Points` → WAR1 ordering
- `?sort=war1` → WAR1 ordering (new public alias)
- `?sort=drblWar` → WAR1 ordering (legacy)

## API / data
- Field `r1WinEquivalents` unchanged
- No schema migration
