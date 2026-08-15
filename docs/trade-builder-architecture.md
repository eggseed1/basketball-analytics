# Trade Builder / Cap–Asset architecture (foundation)

**Status:** Architecture prepared — **not** production-activated  
**Date:** 2026-08-15  
**Constraint:** Never invent structure from ESPN free text. Structured ledger count remains **0** until a licensed source clears the NO-GO gate (`docs/structured-transaction-source-audit.md`).

---

## Trust layers (unchanged)

| Layer | Meaning | Production |
| ----- | ------- | ---------- |
| Source event | Verbatim ESPN report | Live |
| Related event cluster | Safely linked reports | Live |
| Structured transaction | Verified assets / participants | **0** |
| Ownership edges | Asset conveyance with IDs | **0** |
| Genealogy UI | Trace UI gate | **blocked** |

---

## Product destination (eventual)

```
TRANSACTION
  → ASSET / CAP MECHANICS
  → TRADE BUILDER
  → TRADE LEGALITY CHECK (deterministic)
  → TRADE ANALYZER (quality ≠ legality)
  → TRADE GENEALOGY
```

Do **not** build the full machine from the ESPN archive.

---

## Cap fit progression (explicit)

Future tooling must keep these separate:

1. **Salary fit** — does the dollar amount fit the selected mechanism (e.g. TPE remaining)?
2. **Transaction eligibility** — are there restrictions on moving that player/asset?
3. **Trade legality** — does the **entire** proposal satisfy CBA / roster / timing / ownership rules?

Never collapse into “tradable players” until `validateTrade` (or equivalent) exists.

Learn concepts: `salary_fit`, `trade_legality`, `trade_exception` (`/learn/salary-fit-vs-legality`, `/learn/trade-exception`).

---

## Team asset ledger

Query: `getTeamAssets({ teamId, season?, abbreviation?, asOfDate? })`

| Category | Gate |
| -------- | ---- |
| Players | Canonical board `playerId` for the season |
| Draft capital | Structured pick ownership ledger |
| Trade exceptions | Structured TPE feed |
| Draft rights / stash | Structured rights ledger |
| Other | Only admitted with provenance |

Production today: **players** from season board when IDs exist; all other categories **blocked_pending_structured_source**.

TPE “what can fit?”: `getTradeExceptionFits` — always unavailable until salary + TPE sources exist. Shape keeps `salaryFit` / `potentiallyEligible` / `legalityValidated` separate.

---

## Player linking rule

| Input | Behavior |
| ----- | -------- |
| Canonical `playerId` | `PlayerIdentity` → `/players/[id]?season=<resolved>` |
| ESPN free-text name only | **No link** — no name-match, regex, or fuzzy |

Helpers: `transactionPlayerHref`, `canLinkTransactionPlayer`, `getPlayerDefaultSeason` / `resolvePlayerDefaultSeason`.

---

## Future Trade Builder (not implemented)

Suggested flow / URL later: `/trade-builder?...`

1. Choose teams  
2. Choose players (verified IDs)  
3. Choose picks / exceptions (verified ownership)  
4. Show cap mechanics  
5. **Validate legality** (`validateTrade` — deterministic reasons)  
6. **Analyze quality** (DRBL value, fit, risk — separate module)  
7. Save / share  

ASK DRBL may eventually explain validator results; it must **not** decide legality.

---

## Future Trade Analyzer

Answers **after** legality:

- What does each side gain?
- Cap / flexibility / draft capital impact
- Basketball value (DRBL)

Does **not** replace the validator.

---

## Commercial / licensing

Any structured cap, salary, pick, or TPE source needs provenance, coverage notes, and terms review before commercial exposure (API, paid tools, team products). Flag legal review where required — do not make legal conclusions in product copy.

---

## Activation checklist (when a source clears NO-GO)

- [ ] Ingest structured transactions with asset IDs  
- [ ] Ownership edges + genealogy gate  
- [ ] Unlock draft capital / TPE / rights categories in `getTeamAssets`  
- [ ] Wire TPE detail + salary-fit lists with explicit disclaimers  
- [ ] Implement `validateTrade` before any “legal / not legal” UI  
- [ ] Keep analyzer separate from validator  
- [ ] Add Learn concepts only for surfaces that ship  

Until then: honest “data unavailable” is correct.
