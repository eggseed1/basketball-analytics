# Normalized historical event schema

**Version:** `historical-pbp-normalized-v1`

Defined in `drbl/historical/normalized-event-schema.ts`.

Minimum fields: season, gameId, eventIndex, period, clockSecondsRemaining, eventType, subType, offense/defense team IDs, primary/secondary/tertiary player IDs, points, scoreHome/Away, shot fields, FT fields, rebound/turnover/foul types, substitution in/out, sourceProvider, sourceEventId, normalizationVersion, rawSourcePointer.

Unknowns remain `null` — never coerced to fake known values.
