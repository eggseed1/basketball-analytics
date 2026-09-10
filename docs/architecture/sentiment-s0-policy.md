# Sentiment S0 — Source & sampling policy

Companion to `docs/architecture/sentiment.md`. This document gates automated ingest (S1+).

**Status:** Draft for internal prototype. Not legal sign-off.

---

## Scope

Sentiment measures **perception** from permitted sources. It does not:

- Scrape platforms without API/license approval
- Present volume as representative of all fans
- Imply causation between events and sentiment shifts

---

## Platform policy

| Platform | S0 decision | Sampling rule |
| --- | --- | --- |
| **Reddit** | S1 candidate | Approved subreddit list; top/week + new/hot caps; no brigade threads; account-age filter when API permits |
| **News / beat** | S1 candidate | Licensed feeds or manual curator links; headline + lede tone only until full-article rights |
| **YouTube** | S2+ | Caption/transcript rights required; creator opt-out honored |
| **X (Twitter)** | **Omit** | No scraping. Revisit only with permitted API, attribution, retention policy, and cost model |

---

## Entity resolution

- Join mentions to players via production-approved alias crosswalk (`player-id-aliases.json`)
- Ambiguous names → `coverageConfidence` penalty or drop
- Team abbreviations must resolve to canonical ESPN/NBA team ids

---

## Aggregation contract

Every published lane stores:

- `score`, `polarity`, `direction`
- `mentionVolume` and `coverageConfidence`
- `platformBreakdown`, `topicBreakdown`
- `modelVersion`, window, `computedAt`

**UI rule:** hide scores below coverage floor (see `manifest.coverageFloor` in seeds).

Fan and media lanes are **never blended** into one unexplained number.

---

## Event association (S3)

- Wording: “associated with” not “caused by”
- Completed Movement Center trades resolve clusters → remove players from `trade_speculation` narratives (see `src/sentiment/narrative-hygiene.ts`)
- Link to `MovementStoryCluster.id`, `TransactionEvent.id`, or game ids where available

---

## Evaluation (before S2 product tab)

| Gate | Target |
| --- | --- |
| Human eval set | 500 labeled mentions (fan + media mix) |
| Polarity accuracy | ≥ 0.75 macro-F1 on eval set |
| Topic classifier | ≥ 0.65 on agreed taxonomy |
| Bias review | Document demographic skew per platform |

---

## Retention & safety

- Store aggregates + sampled exemplar ids, not full raw posts in product DB
- Toxicity: queue for moderation; never surface slurs in UI
- Deleted content: tombstone row; reduce `coverageConfidence`

---

## Build pipeline

```bash
# Rebuild curated snapshot from seeds + observations (writes data/ AND runtime bundle)
npm run sentiment:build

# Deploy-time copy only (if data/snapshot already fresh)
npm run sentiment:sync
```

Inputs:

- `data/sentiment/seeds/v1/` — manifest, pilot roster, hand-crafted profiles, league mood
- `data/sentiment/observations/v1/*.json` — raw observation batches (see `_template.example.json`)
- `data/movement-center/v1/snapshot.json` — trade-resolution hygiene

Outputs:

- `data/sentiment/v1/snapshot.json` — provenance / local source of truth
- `src/data/runtime/sentiment-snapshot.json` — Cloudflare Worker import (no `node:fs`)

### Iteration loop

1. Add or edit an observation batch under `observations/v1/`
2. `npm run sentiment:build`
3. Check `/internal/sentiment` for coverage / provenance counts
4. Spot-check `/sentiment`, home movers, player `?view=sentiment`, team `?tab=organization`

Deploy scripts run `build-runtime-sentiment-snapshot.mjs` so the Worker always ships the latest `data/` snapshot.

---

## Non-goals (S0)

- Live streaming ingest
- X scraping
- Sentiment in DRBL rankings or Movement evidence scores
- Single “% positive” badge without volume context
