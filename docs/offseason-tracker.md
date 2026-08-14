# Real NBA Offseason Tracker v1

Route: `/offseason`

## What this is

A **transaction event** explorer over the ESPN free-text archive:

- date
- team (canonical ESPN team id)
- description
- derived NBA season
- source-text category (keyword classification)

## What this is not

- Not a structured trade ledger
- Not asset genealogy / Trade Family Tree
- Not player acquisition history (no athlete IDs)

`genealogyUiReady` remains **false**.

## Concepts

| Concept | Meaning |
| --- | --- |
| Transaction event | Provenance-backed ESPN blurb |
| Source-text category | Keyword class of the description (`trade`, `signing`, …) — **not** an official ESPN enum |
| Offseason year | Summer label year; window **Jun 1 – Oct 15** of that year |

Default offseason year: June–Dec → current calendar year; Jan–May → previous year.

## Queries

```ts
getOffseasonPulse()
listTransactionEvents(filters, { page, pageSize })
getOffseasonTimeline(filters)
getTeamOffseasonActivity(filters)
getTransactionEvent(id)
getTransactionEventCoverage()
listAvailableOffseasonYears()
```

## Integrations

- Nav: **Offseason**
- Home: compact pulse module
- Team profile: **Offseason activity** → `/offseason?team={espnTeamId}`

## Tests

```bash
npm run test:offseason-tracker
```
