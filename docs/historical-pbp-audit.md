# Historical PBP — attach boundary

**As of:** 2026-08-16  
**Baseline:** production `560b67b` + local attach-layer work  
**Executable PBP (ASK / Game Lab):** **still false**

---

## Status

| Item | Result |
| --- | --- |
| Real event corpus in repo / env | **Not attached** |
| Manifest at default path | **Absent** |
| `getPbpCapability()` | all `false` |
| ASK zone / clock / possession | unsupported (unchanged) |

The corpus is expected to be produced **outside** this repository and then pointed at via configuration.

---

## Where the corpus lives

| Mode | Location |
| --- | --- |
| Default (repo-local) | `data/pbp/` (gitignored event files; README tracked) |
| Preferred for large imports | Absolute/shared path via **`PBP_DATA_PATH`** |

Do **not** commit multi‑GB event dumps into Git.

---

## How the application accesses it

```text
PBP_DATA_PATH  (optional)
      │
      ▼
resolvePbpDataPath()
      │
      ▼
<dataPath>/manifest.json
      │
      ▼
getPbpCorpusStatus() / getPbpCorpusManifest()
```

| API | Role |
| --- | --- |
| `resolvePbpDataPath()` | Env → absolute root |
| `getPbpCorpusStatus()` | `missing` \| `unreadable` \| `malformed` \| `attached` |
| `getPbpCorpusManifest()` | Declarative counts (no full-corpus scan) |
| `getPbpGameRecord()` | **Deferred** — returns `null` until format is observed |
| `getPbpCapability()` | Always `false` until Phase B executor wiring |

Code: `src/pbp/` — **client-safe** `index.ts` (types + `getPbpCapability`); **Node/CLI** `corpus.ts` (fs / manifest); **Next.js** `corpus.server.ts` (`server-only` re-export). Application code must import `@/pbp/corpus.server`. CLI/tsx imports `@/pbp/corpus`. Do not import either corpus module from client components.

---

## Expected format

Unknown until the first real import is attached. The **manifest** is mandatory and must not require scanning all events:

```json
{
  "source": "…",
  "version": "…",
  "path": "…",
  "importedAt": "ISO-8601",
  "games": 0,
  "events": 0,
  "seasons": ["YYYY-YY"],
  "earliestSeason": "YYYY-YY",
  "latestSeason": "YYYY-YY",
  "fileCount": 0,
  "format": "jsonl|parquet|sqlite|…",
  "notes": []
}
```

Season strings must use the site convention **`YYYY-YY`**.

Event / shot / clock / zone columns are **not** frozen yet — extend `PbpEvent` only after inspecting real rows.

---

## Manifest location

```text
$PBP_DATA_PATH/manifest.json
# or
<data/pbp>/manifest.json
```

---

## Import / rebuild procedure (repeatable)

```text
external source
  → raw corpus (outside Git)
  → normalize IDs (player / team / game / season)
    · reuse canonical team identity + historical team-era (560b67b)
    · do not invent a second player-ID universe
  → write files under PBP_DATA_PATH
  → write manifest.json (declared counts)
  → npm run report:pbp-coverage
  → update this audit with observed schema
```

Attaching data alone does **not** enable ASK PBP queries.

---

## Validation commands

```bash
npm run test:pbp-capability   # attach boundary + capability denial
npm run report:pbp-coverage   # status + manifest counts (no event scan)
```

Synthetic fixtures live under `scripts/fixtures/pbp/` and **must not** unlock production capability.

---

## Current coverage

| Metric | Value |
| --- | ---: |
| Games / events (real) | **0 / 0** |
| Shot zones / college three | **unsupported** |
| Local | not attached |
| Preview | not configured |
| Production | not configured |

---

## Known limitations

1. No event store → no clock/zone/possession audits against real rows.  
2. `college_three` remains AST-only / unsupported.  
3. `getPbpGameRecord` deferred until format known.  
4. Historical team-era must be applied at normalization time for display — do not regress Seattle→OKC branding.  
5. Local attach ≠ Preview/Production availability.

---

## Stop condition (this milestone)

**Corpus not attached.** Boundary is ready. **Do not build the PBP executor** until a real manifest + event schema re-audit pass.
