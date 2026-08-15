# Real NBA Offseason Tracker v1.1

Route: `/offseason`

## What this is

A **transaction event** explorer over the ESPN free-text archive:

- date
- team (canonical ESPN team id)
- description (verbatim source text)
- derived NBA season
- source-text category (keyword classification)
- optional **related-event clusters** when reciprocal source evidence exists

## What this is not

- Not a structured trade ledger
- Not asset genealogy / Trade Family Tree
- Not player acquisition history (no athlete IDs)

`genealogyUiReady` remains **false**.  
Production **structured transactions** count remains **0**.

---

## Transaction Event Semantics

| Concept | Meaning |
| --- | --- |
| **Source event** | One provenance-backed ESPN blurb (date + team + description). Shown as recorded. |
| **Source-text category** | Keyword class of the description (`trade`, `signing`, …). Means “wording looked like X” — **not** “DRBL knows the complete package.” |
| **Related event cluster** | Two+ source events on the **same date** with **reciprocal counterparty team mentions** (brand aliases only). Groups blurbs that appear to describe the same move. |
| **Structured transaction** | Verified participating teams + incoming/outgoing assets. **Not available** from ESPN free text. |
| Offseason year | Summer label year; window **Jun 1 – Oct 15** of that year |

### What can be inferred

- That ESPN recorded a note for a team on a date
- That two notes may be related when date + reciprocal team mentions align

### What cannot be inferred from free text

- Exact pick identities (e.g. “2028 first-round pick”)
- Outgoing players not named on a given blurb
- Ownership edges / asset lineage
- A complete trade package from one-sided wording such as “acquired X for draft considerations”

### Clustering rules (conservative)

Only cluster when **all** hold:

1. Same calendar date
2. Distinct structured `teamId`s
3. Each description mentions the counterpart via known brand aliases
4. Counterparty trade/acquisition language (`acquired`/`traded`/`from`/`to`/`in exchange`)

Unrelated same-day events stay separate. Clusters are precomputed at index build time (O(events per day²), not full-archive²).

Default offseason year: June–Dec → current calendar year; Jan–May → previous year.

## Queries

```ts
getOffseasonPulse()
listTransactionEvents(filters, { page, pageSize })
getOffseasonTimeline(filters) // includes feedByMonth with clusters
getTeamOffseasonActivity(filters)
getTransactionEvent(id)
getTransactionEventWithRelations(id)
getTransactionEventCoverage()
listAvailableOffseasonYears()
```

## Integrations

- Nav: **Offseason**
- Home: compact pulse module
- Team profile: **Offseason activity** → `/offseason?team={espnTeamId}`
- ASK DRBL: offseason pulse; trade-package questions disclose “no verified structured ledger”

## Tests

```bash
npm run test:offseason-tracker
```
