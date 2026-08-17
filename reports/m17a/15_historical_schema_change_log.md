# Historical schema change log (archive-visible)

Observed archive seasons: 2024-25, 2025-26.

Within the supplied archive (CDN 2024-25 / 2025-26 only):

- No cross-decade schema transition is present (archive does not include older seasons).
- Both seasons use the same `nba-cdn-playbyplayv3` family.
- Substitution, shot location, score state, and related-actor fields are present in the modern CDN schema.
- Possession / lineup reconstruction uses the frozen current pipeline (`drbl-recon-*`).

**No era-specific model parameter changes were introduced.**
