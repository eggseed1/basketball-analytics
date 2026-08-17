# UI smoke test (static / component inventory)

Browser automation not required for M16l3 data cutover. Verified via source inventory:

- Leaderboard/explore sort includes R1 Points and R1 Win Equivalents
- Player savant surfaces R1 fields
- Glossary distinguishes DRBL/100 vs R1 Points vs R1 WinEq (noncausal)
- Precomputed boards now carry full-precision r1Points / r1WinEquivalents
- Legacy WAR not presented as canonical cumulative value

Checks: {
  "exploreHasR1Points": true,
  "exploreHasR1WinEq": true,
  "savantHasR1": true,
  "glossaryHasR1": true,
  "boardsHaveR1AfterCutover": true,
  "legacyWarNotCanonicalLabel": true
}

UI_SMOKE_TEST = PASS
