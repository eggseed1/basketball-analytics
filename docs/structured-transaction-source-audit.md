# Structured transaction source audit

**Date:** 2026-08-14  
**Status:** **NO-GO for production ingestion**  
**Scope:** Discover and evaluate real structured sources for asset-level trades, drafts, and pick ownership — without implementing an importer or genealogy UI.

This audit does **not** weaken the Offseason Tracker distinction:

| Layer | Meaning | Current production |
| ----- | ------- | ------------------ |
| **Source event** | Verbatim ESPN free-text event | ~11,089 |
| **Related event cluster** | Safely connected source events | 31 |
| **Structured transaction** | Verified asset-level ledger | **0** |
| Ownership edges | Asset transfers with IDs | **0** |
| `genealogyUiReady` | Genealogy UI gate | **false** (unchanged) |

**Product principle:** ESPN reports narrative. Structured data must say what assets actually moved. Genealogy comes only after a trustworthy ledger.

---

## Verdict (executive)

**No source currently available in this repository — or verified end-to-end under our commercial constraints — can yet unlock Trade Genealogy.**

Closest **commercial evaluation candidate:** **Sportradar NBA API** (Daily Transfers + Draft / in-draft Trades feeds), subject to trial verification of multi-asset packages, pick identity, and licensing.

Closest **public draft-conversion candidate (trades not included):** unofficial **NBA Stats `drafthistory`**, subject to legal review of Terms of Use and storage/redistribution rules.

**Do not ingest yet.** Prefer a licensed structured ledger over inventing one from ESPN blurbs.

---

## Explicitly rejected as structured trade truth

These may remain **contextual** only:

| Artifact | Why rejected |
| -------- | ------------ |
| ESPN free-text event descriptions | Team blurbs; `assets: []`; no athlete/pick IDs |
| Related event clusters | Link reporting events; not asset ledgers |
| Franchise Lab `tradeLog` | Simulation / what-if only |
| Simulated transactions | Not historical truth |
| Free-text `Player.draftInfo` | Narrative, not pick ownership |
| Loose player-name parsing | Ambiguous; not canonical IDs |
| Keyword reconstruction of trades | Infers structure ESPN does not provide |
| Inferred pick ownership | Genealogy-grade lineage requires source-known conveyance |
| Manually authored famous trade chains | Narrative fill-in; violates “trust the data” |

---

## Candidate sources table

| Source | Trades | Player IDs | Drafts | Pick ownership | Protections | Swaps | Multi-team | Years (verified in-repo / docs) | Commercial concerns |
| ------ | ------ | ---------- | ------ | -------------- | ----------- | ----- | ---------- | -------------------------------- | ------------------- |
| ESPN Site v2 transactions (current archive) | Free-text only | None | Mentions in text only | Text labels only | Text only | Text only | Split per-team blurbs | Calendar 2000–2026 in archive | ESPN content; redistribution / commercial use needs review |
| BallDontLie API (configured) | **No trades endpoint** in OpenAPI | BDL + optional NBA `id` | `draft_year` / `round` / `number` on player | No | No | No | N/A | Player career fields; not a trade ledger | Paid tiers; API terms; do not scrape |
| Local CSV / impact / salary caches | No | Mixed (BDL / names) | No trade/draft ledger | No | No | No | No | N/A | Internal derived data only |
| Franchise Lab tradeLog | Sim only | Sim | Sim | Sim | Sim | Sim | Sim | N/A | Not historical truth |
| NBA Stats `drafthistory` (unofficial HTTP) | No | `PERSON_ID` | Yes (season, round, pick, team) | No | No | No | N/A | Docs claim long history; **live fetch not verified in this audit** | NBA.com ToS; unofficial; storage/redistribution **legal review required** |
| Basketball-Reference HTML | Tables (scraping) | bbref IDs | Draft pages | Partial rights pages (HTML) | Often prose | Often prose | Often prose | Broad historical HTML | Scraping generally restricted; commercial redistribution high risk |
| Spotrac transaction HTML | Player-centric HTML | Spotrac IDs | Partial | Partial / prose | Prose | Prose | Often split | Site-dependent | Commercial scrape risk; licensing unclear for product APIs |
| Sportradar NBA API (docs only; no key in repo) | Daily Transfers (player moves); in-draft Trades | GUID + NBA `reference` | Draft Summary / Picks | `future_pick` year/round in draft trades; **ownership ledger not documented** | Not documented as first-class fields | Not documented as first-class fields | Unclear for mid-season packages | Daily Transfers path enum **2013–2026**; draft feeds separate | **Paid marketplace license**; commercial use / redistribution governed by contract — **legal + sales review required** |

---

## Candidate deep dives

### 1. ESPN Site v2 transactions (in production)

#### Available

- Verbatim team-day descriptions (`date`, `teamIds`, `description`, keyword `type`).
- Archive coverage in-repo: **2000-11-02 → 2026-08-13**, **11,089** events, **0** structured assets, **0** ownership edges.
- Useful as **source-event context** for Offseason Tracker.

#### Missing

- Transaction package structure (incoming/outgoing assets).
- Stable player IDs on events.
- Draft-pick identity (year × round × original owner × current owner).
- Protections, swaps, conveyance as data fields.
- Single multi-team transaction objects.
- Draft conversion (pick → selected player).

#### Reliability

- High as **“what ESPN published that day for that team.”**
- Low as **asset-level truth** (one-sided blurbs, incomplete landmark deals, no IDs).

#### Coverage

- Free-text blurbs: 2000–2026 calendar years present in archive.
- Structured trades / ownership: **none**.

#### Identity

- Teams: ESPN team IDs already mapped in-repo.
- Players: none on events.
- Picks: text fragments only (e.g. “2017 first-round draft pick (No. 3)”).

#### Commercial considerations

- Existing archive already used for product context.
- Re-licensing ESPN text into paid APIs / redistributable datasets needs **legal review**.
- Must not become canonical structured ledger.

#### Graph support

**Cannot** support Asset → Transaction → Ownership → … without inventing structure from prose.

#### Multi-team

Per-team blurbs; clusters only link related *reporting* events — not one structured multi-asset transaction.

---

### 2. BallDontLie (configured provider)

#### Available (verified via OpenAPI / code)

- Games, players, stats, box scores, contracts (tiered).
- Player fields include `draft_year`, `draft_round`, `draft_number` and optional NBA `id`.

#### Missing

- **No trades / transactions / pick-ownership endpoints** in the OpenAPI used by this project.
- No multi-asset trade graph.

#### Reliability / coverage

- Useful for roster/identity/stats; **not** a trade ledger.

#### Identity

- BDL player IDs; optional NBA person id.
- In-repo ESPN↔BDL aliases file is currently **empty** (`data/impact/player-id-aliases.json` → `"aliases": []`).

#### Commercial considerations

- Paid API tiers; follow BallDontLie terms for storage and redistribution.
- Does not solve genealogy alone.

---

### 3. NBA Stats `drafthistory` (unofficial)

#### Available (documented publicly; not ingested here)

- Draft selections: season year, round, pick, team (`TEAM_ID`), player (`PERSON_ID` / name).

#### Missing

- Trades, mid-season movement, pick ownership before draft night, protections, swaps, multi-team packages.

#### Reliability

- Widely used unofficially; **not** a licensed integration in this repo.
- Live endpoint probe from this environment did not complete reliably (request hung) — treat coverage claims cautiously until a successful authenticated/authorized fetch is logged.

#### Coverage

- **Drafts only** (if verified): historically deep in public reports; **not verified end-to-end in this audit**.
- Trades / pick ownership: **none**.

#### Identity

- NBA `PERSON_ID` / `TEAM_ID` — mappable to repository NBA-aligned IDs via an **explicit mapping layer** (do not invent a second permanent player system).

#### Commercial considerations

- NBA.com Terms of Use typically restrict scraping / unauthorized commercial use.
- **Flag for legal review** before any local archive, paid API, or redistributed derived dataset.

#### Graph / draft conversion

- Can support **Draft pick (at selection) → Player** *if* pick identity is already known from another ledger.
- **Cannot** alone answer “how did Boston acquire the pick used on Tatum?”

---

### 4. Basketball-Reference / Spotrac (HTML)

#### Available

- Rich human-readable draft, trade, and rights tables.

#### Missing for product use

- Licensed machine API in this repo: **none**.
- Stable machine guarantees for multi-team packages / pick IDs: **not verified as structured feeds**.

#### Commercial considerations

- Scraping and redistribution commonly restricted.
- **Not recommended** as primary commercial structured truth without a license.

---

### 5. Sportradar NBA API (strongest *candidate* — not yet verified with a key)

Documentation reviewed (developer.sportradar.com basketball NBA v7/v8 references). **No Sportradar API key or responses are present in this repository.** Claims below are from **published docs/examples only**.

#### Available (documented)

| Feed | Structured signals |
| ---- | ------------------ |
| **Daily Transfers** | Transfer GUID; player GUID + NBA `reference`; `from_team` / `to_team` with NBA team `reference`; `transaction_type` / `transaction_code`; `effective_date`; free-text `desc`. Path years enum includes **2013–2026**. |
| **Draft Summary / Picks** | Draft pick rows with team + player IDs when selected. |
| **Trades (in-draft)** | Trade GUID; `from_team` / `to_team`; `trade_items` typed `player` / `pick` / `future_pick` (examples show `id`, `year`, `round` for future picks). |

#### Missing / unclear (must verify on trial before GO)

- Mid-season **multi-asset package** as **one** transaction with all players + picks (Daily Transfers examples are **player-centric** one-leg moves with prose `desc`).
- First-class **pick identity** distinguishing “2028 BOS 1st” vs “2028 PHI 1st” with original vs current owner.
- Protections, swaps, conditions as structured fields (not prose).
- Historical pick-ownership ledger spanning decades of conveyances.
- Pre-2013 Daily Transfers (enum starts 2013 in current OpenAPI snippet).
- Whether in-draft `future_pick` items carry original-owner / protection metadata.

#### Reliability

- Commercial sports data vendor; generally high operational quality **when licensed**.
- Until trial samples of landmark trades are pulled, **genealogy fitness is unproven**.

#### Coverage (docs)

- Player transfers by day: enum **2013–2026** (not full NBA history).
- In-draft trades: draft-night scope (not a full historical trade archive by itself).
- Drafts: via Draft endpoints (depth depends on purchased package — verify).

#### Identity

- Players: Sportradar GUID + `sr_id` + NBA `reference` → map to repo players via NBA id / explicit alias table.
- Teams: Sportradar GUID + NBA `reference` → map to repo team/franchise model (document relocation rules; do not silently flatten).

#### Commercial considerations

- Marketplace / contract pricing.
- Redistribution, derived datasets, and public APIs typically restricted by license.
- **Legal + commercial review required** before storing a local ledger for a paid product.

#### Graph support

- **Potentially** for player movement edges (2013+) if transfers can be grouped into packages.
- **Not proven** for pick ownership chains or full Asset↔Transaction genealogy.

---

## Identity mapping requirements

### Players

| Requirement | Current state |
| ----------- | ------------- |
| Prefer stable source IDs | ESPN events: none; BDL: yes for players; Sportradar docs: yes (NBA `reference`); NBA Stats draft: `PERSON_ID` |
| Map to repository canonical player identity | Use **mapping layer** only; do not create a second permanent identity system |
| Resolution % / unresolved / ambiguous | **N/A** — no structured trade source ingested; ESPN events remain 0% athlete-resolved |

### Teams

| Requirement | Current state |
| ----------- | ------------- |
| Stable team IDs | ESPN team IDs in archive; NBA numeric IDs in BDL/NBA Stats/Sportradar `reference` |
| Franchise transitions | Must follow existing team/franchise model; document relocation/rename rules before ingest |

### Draft picks

Genealogy needs more than a text label:

| Capability | ESPN | BDL | NBA DraftHistory | Sportradar (docs) |
| ---------- | ---- | --- | ---------------- | ----------------- |
| Year + round + pick number at selection | Text only | Player draft fields | Yes | Draft feeds |
| Distinguish BOS 2028 1st vs PHI 2028 1st as assets | No | No | No (selection only) | Unclear / not documented as ownership ledger |
| Original owner ≠ current owner | No | No | No | Unclear |
| Protection / swap / conveyance / conditional | Text | No | No | Unclear |

**A simple text label is not genealogy-grade.**

---

## Transaction graph requirements

Needed:

```text
Asset → Transaction → Ownership transition → Transaction → Asset
```

| Source | Can support? | Why |
| ------ | ------------ | --- |
| ESPN archive | **No** | No assets / edges |
| BallDontLie | **No** | No trade ledger |
| NBA DraftHistory | **Partial (draft conversion only)** | Selection nodes without prior ownership edges |
| Sportradar | **Unknown — trial required** | Player transfers documented; pick ownership / package semantics not proven |

---

## Multi-team transactions

| Source | Representation |
| ------ | -------------- |
| ESPN | Separate team blurbs (+ optional related-event **clusters**) |
| Sportradar Daily Transfers (docs) | Appears as per-player transfer rows; package coalescing **unverified** |
| Sportradar in-draft Trades (docs) | Single trade object with `trade_items` between two teams in examples — multi-team mid-season **unverified** |

**Core requirement:** one transaction with multiple teams and all incoming/outgoing assets. **No verified source in-repo meets this for historical mid-season deals.**

---

## Draft conversion

Needed path:

```text
Draft pick asset → Draft selection → Player asset
```

| Source | Support |
| ------ | ------- |
| ESPN | **Fail** — no structured selection of Jayson Tatum; archive has 2024 extension text and unrelated Jamaal Tatum signings |
| BDL | Player draft year/round/number only — not pick ownership history |
| NBA DraftHistory | **Likely** selection row if live fetch succeeds and IDs map |
| Sportradar Draft | **Likely** if licensed |

Without a pick-ownership ledger, conversion alone cannot answer acquisition genealogy.

---

## Historical coverage (honest)

### In-repository today

| Domain | Earliest → latest | Notes |
| ------ | ----------------- | ----- |
| ESPN free-text events | 2000-11-02 → 2026-08-13 | Not structured |
| Structured trades | — | **0** |
| Drafts (structured) | — | **0** in transaction ledger |
| Pick ownership | — | **0** |
| Player movement (structured) | — | **0** |
| Structured multi-team trades | — | **0** |

### Documented external candidates (not ingested)

| Domain | Sportradar (docs) | NBA DraftHistory |
| ------ | ----------------- | ---------------- |
| Trades / transfers | Daily Transfers enum **2013–2026**; in-draft trades = draft night | None |
| Drafts | Draft package (verify depth) | Reportedly deep; **unverified here** |
| Pick ownership | **Not established** | None |
| Multi-team structured | **Unverified** | N/A |

**Do not imply full NBA history.**

---

## Sample reconstruction tests (structured data only)

Rules: no memory fill-in; no ESPN prose elevation to structured truth; no Franchise Lab.

### Test A — Boston / Tatum (pick → draft → player)

**Target:** Reconstruct the structured chain leading to the pick Boston used to select Jayson Tatum, then the selection itself.

| Step | Result from available structured sources |
| ---- | ---------------------------------------- |
| Structured transactions in repo | **0** — chain cannot start |
| ESPN free-text (context only) | One-sided 2017-06-19 Boston blurb mentions swapping No. 1 for PHI No. 3 + conditional future first — **not admitted as structured** |
| ESPN draft conversion | **Break:** no event recording Boston selecting Jayson Tatum with a pick ID |
| BDL / local CSVs | No trade package / pick ownership rows |
| NBA DraftHistory / Sportradar | **Not available in-repo** — not used |

**Break point:** No structured pick identity or ownership edges exist. Even elevating ESPN prose would still fail draft conversion in this archive.

### Test B — Boston / Brooklyn Kevin Garnett & Paul Pierce era

**Target:** Derive the historical Boston ↔ Brooklyn transaction family from structured records only.

| Step | Result |
| ---- | ------ |
| Structured transactions | **0** |
| ESPN search for Pierce + Brooklyn/Nets trade-ish blurbs | **0 hits** in `transactions.jsonl` |
| ESPN search for 2013-06/07 Boston package text containing Pierce/Garnett/Brooklyn | **No complete package found** in sampled 2013 Boston raw year file for the landmark deal |
| Conclusion | **Chain breaks immediately** — archive does not even provide reliable free-text coverage of the landmark package, and structured data is absent |

### Test C — Player-for-player / player-for-picks / multi-hop pick / multi-team

All **fail** for the same reason: **zero structured assets and ownership edges** in production data.

---

## Known failures (summary)

1. Production structured ledger is empty (`structuredTransactions = 0`, ownership edges file empty).
2. ESPN cannot ground Tatum selection or Pierce–Brooklyn package as structured assets.
3. BallDontLie OpenAPI has no trade ledger.
4. NBA Stats draft feed is draft-only and commercially sensitive; live verification incomplete.
5. Sportradar looks promising on paper but **in-draft trades ≠ historical multi-asset ledger**; Daily Transfers may be player-leg oriented; pick ownership/protections/swaps **not documented as genealogy-ready**.
6. HTML scrapers (BBRef/Spotrac) are poor commercial foundations without licenses.

---

## Commercial / licensing considerations

**Not legal advice.** Flag for counsel / vendor review:

| Source | Notes to review |
| ------ | --------------- |
| ESPN | Terms for storing, displaying, and redistributing transaction text; paid API exposure |
| BallDontLie | Plan limits; caching; redistribution of API payloads |
| NBA Stats / NBA.com | Unofficial access; ToS on scraping, commercial use, derived datasets |
| Sportradar | Contract scope (which feeds), historical depth, redistribution, derived analytics, attribution |
| BBRef / Spotrac | Scraping bans; commercial reuse |

Especially sensitive if DRBL later ships:

- public/partner APIs
- paid historical trade datasets
- redistributed derived lineage graphs

---

## Genealogy readiness impact

Existing conservative thresholds (unchanged by this audit; still fail):

```text
minTransactions:        1_000
minOwnershipEdges:        500
minDraftPickAssets:       100
minPlayerAssetsWithIds:   500
maxBrokenEdgeRate:       0.02
genealogyUiReady:       false
```

### Proposed additional readiness criteria (document only — do not flip UI)

Before `genealogyUiReady = true`, also require:

| Criterion | Proposed conservative bar |
| --------- | ------------------------- |
| Licensed / approved structured source | Written commercial + legal OK |
| Player ID resolution on trade legs | ≥ 98% of player assets map to canonical IDs |
| Pick ID resolution | ≥ 95% of pick assets have year+round+originalOwner+currentOwner keys |
| Multi-team package integrity | Landmark multi-team samples reconstruct as **one** transaction |
| Draft conversion | ≥ 95% of first-round picks in coverage window resolve to selected player IDs |
| Broken lineage rate | ≤ 2% on sampled chains |
| Historical depth | Explicit published window (e.g. transfers 2013+ **and** drafts 1980+ **or** whatever the license actually covers) — no silent “full history” claim |
| Validation targets | Boston/Tatum chain and Boston/KG–Pierce chain reconstruct **from structured source only** |
| ESPN coexistence | ESPN remains source-event context; never overwritten |

Fixtures / synthetic tests may validate transformers; **they do not unlock genealogy UI**.

---

## Recommendation

### NO-GO (immediate ingestion)

Do **not** build a production importer until:

1. A licensed (or otherwise legally approved) structured source is selected, and  
2. Trial extracts prove multi-asset packages, pick identity/ownership, and the two Boston validation chains.

### Best structured source **candidate**

**Sportradar NBA API** — evaluate under trial:

1. Pull Daily Transfers for known multi-team trade dates; inspect whether packages coalesce.  
2. Pull in-draft Trades + Draft Picks for 2017; test Tatum selection linkage.  
3. Search for pick-protection / swap / future_pick metadata completeness.  
4. Attempt KG–Pierce / Brooklyn reconstruction within licensed year range (may still fail if history starts 2013 and package semantics are weak).  
5. Complete commercial/legal review for local ledger + product APIs.

### Complementary (not sufficient alone)

**NBA Stats DraftHistory** (or Sportradar Draft) as **draft-conversion** layer only — after legal review — mapped via NBA person/team IDs.

### Keep

- ESPN archive as **source-event** context.
- Related-event clusters as reporting links.
- `genealogyUiReady = false`.
- Offseason Tracker semantics unchanged.

### If / when GO

Preferred pipeline (design only until GO):

```text
External structured source
  → Transformer
  → CanonicalAsset / DraftPickIdentity / CanonicalTransaction
  → Validation
  → Ownership index
  → Lineage graph
  → Queries
  → Future genealogy UI
```

- Do **not** modify the ESPN event archive semantics.
- Index player / team / pick / transaction IDs for lineage queries; never scan raw vendor files per request.
- Feed Offseason Tracker enrichment later; do not replace ESPN events until the structured source is proven.

---

## After-audit checklist (§26)

| Item | Finding |
| ---- | ------- |
| Best structured source candidate | **Sportradar NBA API** (trial + license pending) |
| Other candidates considered | ESPN archive; BallDontLie; NBA Stats drafthistory; BBRef/Spotrac HTML; Franchise Lab (rejected); local CSVs |
| Exact source capabilities | See table + deep dives; **none verified in-repo as genealogy-ready** |
| Exact historical coverage | ESPN text 2000–2026; structured **0**; Sportradar Daily Transfers docs **2013–2026** enum |
| Player ID coverage | Structured trades: N/A (0 records) |
| Team ID coverage | ESPN teams mapped; structured trades N/A |
| Draft coverage | No structured draft ledger ingested |
| Pick ownership coverage | **0** |
| Protection/swap coverage | **0** structured |
| Multi-team support | Clusters only (reporting); no structured packages |
| Draft conversion support | **Not available** from current ledger |
| Boston / Tatum reconstruction | **FAIL** — no structured chain; ESPN lacks Tatum selection event |
| Boston / KG–Pierce reconstruction | **FAIL** — no structured chain; ESPN lacks usable Pierce–Brooklyn package text |
| Broken chains | Both validation targets break at “no structured source” |
| Commercial / licensing concerns | ESPN redistrib; BDL terms; NBA ToS; Sportradar contract — all need review |
| Recommended ingestion plan | **None until trial GO**; then transformer → canonical ledger → validation → ownership index |
| Revised genealogy readiness | Remains **not ready**; thresholds above; UI must stay off |

---

## Final product principle (unchanged)

```text
WHAT ESPN REPORTED
  → WHAT STRUCTURED DATA SAYS ACTUALLY MOVED
  → WHERE EACH ASSET CAME FROM
  → WHAT EACH ASSET EVENTUALLY BECAME
  → TRADE FAMILY TREE
```

Do not skip the middle layer.  
**Trust the data.**
