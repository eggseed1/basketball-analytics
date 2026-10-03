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

## Automated ingest (S1, started 2026-09-29)

### News headlines (live)

- Sources: publisher RSS feeds listed in `data/sentiment/sources/v1/news-feeds.json` (ESPN, CBS Sports, Yahoo Sports, RealGM wiretap). Headline + first 280 characters of the summary are scored; full articles are never fetched.
- Stored per item in `data/sentiment/ingest/v1/news/YYYY-MM.jsonl`: headline, link, outlet, publish time, tone score, valence hits, topic tags, resolved player/team ids. The summary text is not stored. Rows dedupe by canonical link, so each run extends the series.
- Scorer: `headline-lexicon-v1` (`src/sentiment/headline-lexicon.ts`) = AFINN-165 valences + basketball overrides + two-token negation; resolved player names are masked before scoring.
- Entity resolution (`src/sentiment/headline-entities.ts`): full names always; a lone surname only when unique on current rosters and not an ordinary word; a short nickname list; team nicknames from the headline only.
- Other-sport items are kept but flagged `nba: false` and excluded from every lane.
- Floor: a headline lane needs **3 headlines in the trailing 7 days** (`manifest.ingest.headlineFloor`). The 50-mention floor above was sized for social posts and would hide every headline lane. Below the floor the lane is absent (blank), never neutral.

### Reddit (built, waiting on credentials)

- `npm run sentiment:ingest:reddit` uses the official OAuth API (app-only `client_credentials`) with `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`. Without them it prints a notice and exits 0.
- Approved list and listing caps: `data/sentiment/sources/v1/reddit.json` (r/nba + 30 team subreddits; top/week 100 + hot 50). Stickied, NSFW, removed, game-thread and daily-thread posts are skipped.
- Stored: post id, subreddit, permalink, created time, upvotes, comment count, tone score, topics, resolved ids. **Titles are not stored** (retention rule above).
- Floor: 5 posts in the trailing 7 days.

### Lane provenance

Every lane carries `origin` (`curated` | `headlines` | `reddit`) and `asOf`. Automated lanes replace curated ones only when they clear their floor. Rules that follow from mixing sources:

- Fan vs media gaps are computed only when both lanes are curated or both are measured.
- Team roster rollups average curated lanes only; team media lanes come from headlines naming the team.
- League mood windows show real points only. The old backward extrapolation for 30d/90d was removed.
- Trend (`priorScore`) is null until the previous 7-day window also clears the floor.

### Evaluation status

`headline-lexicon-v1` has **not** been evaluated against the gates above (no 500-mention labeled set yet). Every surface that shows headline tone says so in plain words. Treat it as S1 exploratory until the gate passes.

## Build pipeline

```bash
# Pull headlines + Reddit (skips without creds), then rebuild
npm run sentiment:refresh

# Rebuild snapshot from seeds + observations + ingest (writes data/ AND runtime bundle)
npm run sentiment:build

# Deploy-time copy only (if data/snapshot already fresh)
npm run sentiment:sync
```

Inputs:

- `data/sentiment/seeds/v1/` — manifest, pilot roster, hand-crafted profiles, league mood
- `data/sentiment/observations/v1/*.json` — raw observation batches (see `_template.example.json`)
- `data/sentiment/ingest/v1/{news,reddit}/*.jsonl` — automated ingest stores
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
