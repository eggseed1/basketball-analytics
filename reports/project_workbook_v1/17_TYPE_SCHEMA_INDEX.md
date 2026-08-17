# 17 — Type / schema index

Important exported types from `src/data/types` and `drbl/types` (plus season registry). Not every local alias.

## Conventions

- Percentages are fractions in `[0, 1]`.
- Season strings are canonical `YYYY-YY`.
- UI never speaks ESPN/BDL field names — only canonical types.
- `PlayerSeason.drbl100` is validated EB1600 ability; `r1Points` / `r1WinEquivalents` are realized value (`null` when overlay absent).
- Legacy `drblWar` is `DEPRECATED_NONCANONICAL`.

### `src/data/types/player-season.ts`

Canonical player-season board contract (DRBL + box + impact overlays)

Exports: `PlayerSeason`

### `src/data/types/player.ts`

Player identity

Exports: `Position`, `Player`

### `src/data/types/player-game.ts`

Player game logs

Exports: `PlayerGame`

### `src/data/types/team.ts`

Team identity

Exports: `Team`

### `src/data/types/team-season.ts`

Team season stats

Exports: `TeamSeasonStats`, `TeamSeason`

### `src/data/types/game.ts`

Schedule/game summaries

Exports: `Game`, `GameSummary`

### `src/data/types/game-box-score.ts`

Box score

Exports: `GameBoxScore`

### `src/data/types/standings.ts`

Standings

Exports: `StandingRow`, `ConferenceStandings`, `LeagueStandings`

### `src/data/types/advanced-stats.ts`

Per-game advanced

Exports: `AdvancedPlayerGameStats`

### `src/data/types/advanced-season-stats.ts`

Advanced season coverage/audit types

Exports: `AdvancedSeasonMetricId`, `AdvancedSeasonSourceId`, `AdvancedStatGrain`, `AdvancedRatingSemantics`, `AdvancedStatIdentityMatch`, `AdvancedStatProvenance`, `AdvancedSeasonObservation`, `AdvancedMetricCoverage`, `AdvancedSourceInventoryEntry`, `AdvancedStatsProductionReadiness`, `AdvancedStatsCoverageReport`, `ADVANCED_STATS_AUDIT_METHODOLOGY_VERSION`

### `src/data/types/impact.ts`

DARKO/LEBRON overlay types

Exports: `ImpactSource`, `ImpactRating`, `DarkoRating`, `LebronRating`

### `src/data/types/historical-impact.ts`

Historical impact archive types

Exports: `HistoricalImpactMetricId`, `HistoricalImpactSourceId`, `HistoricalImpactIdentityMatch`, `HistoricalImpactProvenance`, `HistoricalPlayerImpact`, `HistoricalImpactLookupKey`, `HistoricalImpactMetricCoverage`, `HistoricalImpactCoverageReport`, `HISTORICAL_IMPACT_METHODOLOGY_VERSION`

### `src/data/types/filters.ts`

Explore filters

Exports: `BasketballFilters`, `ShotFilters`

### `src/data/types/play-by-play.ts`

PBP events

Exports: `PlayByPlayEvent`, `GamePlayByPlay`

### `src/data/types/shot.ts`

Shot chart

Exports: `Shot`

### `src/data/types/team-assets.ts`

Cap/assets ledger

Exports: `TEAM_ASSETS_METHODOLOGY_VERSION`, `TeamAssetCategoryId`, `CapFitTier`, `CAP_FIT_TIER_LABELS`, `TeamAssetCategoryAvailability`, `TeamAssetCategoryCoverage`, `TeamPlayerAsset`, `TeamDraftPickAsset`, `TeamTradeExceptionAsset`, `TeamDraftRightsAsset`, `TeamAssetEntry`, `TeamAssetLedger`, `TradeExceptionFitResult`, `TRADE_EXCEPTION_FIT_DISCLAIMER`, `EMPTY_TRADE_EXCEPTION_FIT`

### `src/data/types/transaction-event.ts`

Offseason transactions

Exports: `TRANSACTION_EVENT_ARCHIVE_VERSION`, `RelatedTransactionEventCluster`, `OffseasonFeedItem`, `NbaTransactionEvent`, `OffseasonWindow`, `TransactionEventFilters`, `TransactionEventPage`, `TeamOffseasonActivity`, `OffseasonPulse`, `TransactionEventCoverage`

### `src/data/types/transaction-lineage.ts`

Transaction genealogy graph

Exports: `TRANSACTION_LINEAGE_METHODOLOGY_VERSION`, `AssetType`, `DraftPickIdentity`, `CanonicalAsset`, `TransactionAssetDirection`, `TransactionAssetRef`, `TransactionProvenance`, `CanonicalTransaction`, `OwnershipEdge`, `LineageNodeKind`, `LineageNode`, `LineageEdge`, `LineagePath`, `TransactionSourceCoverage`, `IdentityResolutionStats`, `DraftCoverageStats`, `PickCoverageStats`, `GraphQualityStats`, `GenealogyReadinessCriteria`, `TransactionLineageCoverageReport`

### `drbl/types.ts`

DRBL Phase A event/possession/reconcile types

Exports: `DrblSeason`, `DrblGameMeta`, `DrblActionType`, `DrblEvent`, `DrblBoxPlayer`, `DrblBoxScore`, `DrblLineupState`, `DrblPossessionEndReason`, `DrblPossession`, `DrblReconcileStatDiff`, `DrblLineupMinuteDiff`, `DrblLineupReconcileReport`, `DrblGameReconcileReport`, `DrblSeasonReconcileSummary`

### `drbl/historical/season-registry.ts`

Season registry + frozen version constants

Exports: `HistoricalSupportTier`, `ModelProductStatus`, `SeasonRegistryEntry`, `DRBL_V1_ABILITY_VERSION`, `DRBL_V1_R1_POINTS_VERSION`, `DRBL_V1_R1_WINEQ_VERSION`, `HISTORICAL_NORMALIZATION_VERSION`, `HISTORICAL_SUPPORT_CONTRACT_VERSION`, `SEASON_REGISTRY`

## PlayerSeason (DRBL-relevant fields)

From `src/data/types/player-season.ts`: `drbl100`, `rawAbilityRate`, `drblPossessions`, `abilityModelVersion`, `drblRank`, `drblP`, `drblLn`, `drblB`, `drblO`, `drblD`, `r1Points`, `r1WinEquivalents`, `r1PointValueVersion`, `r1WinEquivalentVersion`, deprecated `drblWar`.

## SeasonRegistryEntry

From `drbl/historical/season-registry.ts`: season availability flags, `historicalSourceQualityTier`, `modelProductStatus` (`CANONICAL_PRODUCTION` | `RETROSPECTIVE_FROZEN_V1` | `UNAVAILABLE`), frozen version ids, quality notes/flags. Deprecated alias field: `supportTier`.
