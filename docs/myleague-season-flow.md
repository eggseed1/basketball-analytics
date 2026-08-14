# MyLeague Season Flow (State Machine)

Formal phase machine for Deep MyLeague. Maps conceptually onto Basketball GM’s
`PHASE` enum while adding FO substates (season review, combine, training camp,
etc.) that BBGM folds into coarser phases.

Implementation must **pause sim** when a user-required decision is pending
(see automation settings).

---

## Phase enum

```ts
type MyLeaguePhase =
  | "SEASON_REVIEW"
  | "FRONT_OFFICE_REVIEW"
  | "ROSTER_DECISIONS"
  | "STAFF_REVIEW"
  | "DRAFT_LOTTERY"
  | "DRAFT_COMBINE"
  | "DRAFT"
  | "POST_DRAFT"
  | "FREE_AGENCY"
  | "TRAINING_CAMP"
  | "PRESEASON"
  | "REGULAR_SEASON"
  | "TRADE_DEADLINE"
  | "PLAYOFFS"
  | "FINALS"
  | "SEASON_END";
```

### Mapping to ZenGM `PHASE` (reference)

| MyLeaguePhase | ZenGM PHASE (approx.) |
| --- | --- |
| SEASON_REVIEW … STAFF_REVIEW | start of `DRAFT_LOTTERY` / post-playoffs |
| DRAFT_LOTTERY | `DRAFT_LOTTERY` (4) |
| DRAFT_COMBINE | still lottery / pre-draft UI |
| DRAFT | `DRAFT` (5) |
| POST_DRAFT | `AFTER_DRAFT` (6) |
| ROSTER_DECISIONS / FREE_AGENCY | `RESIGN_PLAYERS` (7) + `FREE_AGENCY` (8) |
| TRAINING_CAMP / PRESEASON | `PRESEASON` (0) |
| REGULAR_SEASON | `REGULAR_SEASON` (1) |
| TRADE_DEADLINE | `AFTER_TRADE_DEADLINE` (2) |
| PLAYOFFS / FINALS | `PLAYOFFS` (3) |
| SEASON_END | transition into next lottery block |

---

## Annual diagram

```text
FINALS / SEASON_END
        ↓
SEASON_REVIEW
        ↓
FRONT_OFFICE_REVIEW
        ↓
ROSTER_DECISIONS          (options, extensions, untouchables)
        ↓
STAFF_REVIEW
        ↓
DRAFT_LOTTERY             (era-correct odds)
        ↓
DRAFT_COMBINE             (scouting; InformationCutoff enforced)
        ↓
DRAFT
        ↓
POST_DRAFT                (rookie deals, roles, two-ways if era-ok)
        ↓
FREE_AGENCY               (staged: QO → early → wave 2 → mins → cuts)
        ↓
TRAINING_CAMP
        ↓
PRESEASON
        ↓
REGULAR_SEASON
        ↓
TRADE_DEADLINE            (midseason review first)
        ↓
REGULAR_SEASON (finish)
        ↓
PLAYOFFS
        ↓
FINALS
        ↓
SEASON_END → timeline event → next SEASON_REVIEW
```

First playable slice may collapse FO review / combine / training camp into
automated defaults until those milestones land.

---

## Per-phase contract

Each phase defines:

| Field | Meaning |
| --- | --- |
| `entry` | Preconditions (previous phase complete, required events flushed) |
| `allowedActions` | User/AI actions that may mutate SimulationUniverse |
| `automaticEvents` | CPU FO moves, news, awards writebacks |
| `deadlines` | Soft/hard stops before advance |
| `exit` | Validation + transition target |
| `simAllowed` | Whether day/week/season sim may run |

---

### SEASON_REVIEW

- **Entry:** Finals complete; awards computed for simulation season.
- **Allowed:** View reports; open Offseason Hub tabs (read-heavy).
- **Automatic:** Generate team overview + optional analytics report.
- **Exit →** `FRONT_OFFICE_REVIEW`.
- **Sim:** blocked.

### FRONT_OFFICE_REVIEW

- **Entry:** Season review acknowledged (or auto-skipped if automation on).
- **Allowed:** Set franchise strategy / owner mandate responses.
- **Exit →** `ROSTER_DECISIONS`.

### ROSTER_DECISIONS

- **Entry:** Contracts/options enumerated for user team (+ AI for others).
- **Allowed:** extend, accept/decline options, waive, trade flag, role change.
- **Automatic:** AI teams resolve options under strategy profile.
- **Exit →** `STAFF_REVIEW` when user roster actions resolved (or auto).

### STAFF_REVIEW

- **Allowed:** hire/fire/upgrade staff (Milestone 6+).
- **Exit →** `DRAFT_LOTTERY`.

### DRAFT_LOTTERY

- **Entry:** Non-playoff set known; **CBARules** for season supply lottery model.
- **Automatic:** Draw lottery; publish order; news.
- **Allowed:** View odds/EV; analytics pick EV (advisory).
- **Exit →** `DRAFT_COMBINE` (or straight `DRAFT` if combine skipped).

### DRAFT_COMBINE

- **Allowed:** Scout assignments; board ranks; trade talks for picks.
- **Rule:** UI filtered by `KnowledgeDate` — no future career leaks.
- **Exit →** `DRAFT`.

### DRAFT

- **Allowed:** select, trade pick/player packages, move up/down.
- **Automatic:** CPU picks via AI FO model (not user’s AnalyticsProvider).
- **Exit →** `POST_DRAFT` when rounds complete.

### POST_DRAFT

- **Allowed:** rookie contracts (scale), roster slots, development plans,
  G League / two-way / stash if era rules allow.
- **Exit →** `FREE_AGENCY`.

### FREE_AGENCY

**Stages** (CBA-driven; skip stages that don’t exist in era):

1. Team options residual  
2. Qualifying offers  
3. Early free agency  
4. Second wave  
5. Minimum contracts  
6. Training-camp cuts  

- **Allowed:** offer, renegotiate, trade, sign-and-trade if legal.
- **Exit →** `TRAINING_CAMP` when user idle + AI market settled (or deadline).

### TRAINING_CAMP

- **Allowed:** depth chart, minutes policy, schemes, development emphasis.
- **Exit →** `PRESEASON`.

### PRESEASON

- **Sim:** preseason games only.
- **Allowed:** rotation experiments; analytics observes.
- **Exit →** `REGULAR_SEASON`.

### REGULAR_SEASON

- **Sim:** 1 game / week / month / to deadline / to season end.
- **Allowed:** lineup, strategy, trades (pre-deadline rules), waivers.
- **Coach mode (optional):** pregame / halftime / clutch interventions
  as modifiers into Layer A — **no parallel possession engine**.
- **Exit →** `TRADE_DEADLINE` at configured day; after deadline resume
  regular season until schedule complete → `PLAYOFFS`.

### TRADE_DEADLINE

- **Entry:** Midseason review generated.
- **Allowed:** trades, buyouts, signings per CBA.
- **Exit →** resume `REGULAR_SEASON` (post-deadline trade rules).

### PLAYOFFS

- **Sim:** series via Layer A playoff engine.
- **Allowed:** series prep (lineups, matchup notes); analytics projections advisory.
- **Exit →** `FINALS` when conference champs set.

### FINALS

- **Exit →** `SEASON_END` after champion.

### SEASON_END

- **Automatic:** Write `TimelineEvent` (simulation); if divergent from reality,
  link `realWorldEquivalent`. Age/develop players; tick contracts; inflation/CBA
  evolution hooks; increment season.
- **Exit →** `SEASON_REVIEW` (next year).

---

## Modes

### Historical Replay

Start from `HistoricalSeasonSnapshot`. Until first divergent `DecisionLog`
entry, simulation may track reality closely. After divergence, universes split
permanently. **Never mutate** reality snapshots.

### Alternate History

Same snapshot clone, but sandbox edits (rosters, rules, picks) allowed before
tip-off; branch point recorded immediately.

---

## Pending decisions

```ts
interface PendingDecision {
  id: string;
  phase: MyLeaguePhase;
  kind: string;
  teamId: string;
  required: boolean;
  expiresAt?: { season: number; phase: MyLeaguePhase; day?: number };
}
```

If `required && !automation.covers(kind)` → **block** multi-day sim.

---

## Automation flags (examples)

- `autoLineup`, `autoScout`, `autoMinContracts`, `autoGLeague`,
  `autoStaff`, `autoTradeAiAssist`

---

## First playable loop ( Milestone 4 )

Minimum enforced path:

```
Historical Start
  → (skip soft FO phases with defaults)
  → DRAFT_LOTTERY → DRAFT
  → FREE_AGENCY
  → PRESEASON → REGULAR_SEASON → PLAYOFFS → FINALS
  → SEASON_END → next DRAFT_LOTTERY
```

Do not declare MyLeague complete until this loop is stable for **multiple
seasons** with Reality ≠ Simulation after the first divergent event.
