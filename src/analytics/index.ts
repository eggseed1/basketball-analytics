export type {
  AnalyticalFinding,
  ComparisonDimension,
  DisclosureLevel,
  EvidenceKind,
  PlayerComparisonResult,
  StatContext,
  StatPopulation,
} from "./types";
export { DISCLOSURE_LABELS } from "./types";
export { buildStatContext, contextBlurb } from "./context";
export {
  explainMetric,
  listExplainedMetrics,
  type MetricExplanation,
} from "./explanations";
export {
  computePlayerEvolution,
  type EvolutionChange,
  type PlayerEvolutionResult,
} from "./evolution";
export { buildPlayerComparison } from "./compare-players";
export {
  PLAYER_SEASON_COMPARE_METHODOLOGY,
  PLAYER_SEASON_COMPARE_VERSION,
  SEASON_COMPARE_TOLERANCE,
  comparePlayerSeasons,
  edgeLabel,
  seasonComparePath,
  type PlayerSeasonCompareMethodology,
  type PlayerSeasonComparison,
  type SeasonCategoryWinner,
  type SeasonCompareCategoryId,
  type SeasonCompareEdge,
  type SeasonCoverageSnapshot,
  type SeasonImpactSnapshot,
  type SeasonMetricRow,
} from "./compare-player-seasons";
export {
  PLAYER_SEASON_RANK_DEFAULT,
  PLAYER_SEASON_RANK_MAX,
  PLAYER_SEASON_RANK_METHODOLOGY,
  PLAYER_SEASON_RANK_MIN,
  PLAYER_SEASON_RANK_VERSION,
  comparePlayerSeasonSet,
  defaultRankSeasons,
  rankPlayerSeasons,
  seasonRankPath,
  seasonWinGraphHasCycle,
  type PairwiseMatchup,
  type PairwiseMatrixCell,
  type PairwiseMatrixResult,
  type PlayerSeasonRanking,
  type PlayerSeasonRankingMethodology,
  type SeasonRankEntry,
} from "./rank-player-seasons";
export {
  analyzeTeamProfile,
  type TeamProfileAnalysis,
  type TeamTrait,
} from "./team-profile";
export {
  buildLeaderboardContextIndex,
  buildLeaderboardRowContext,
  formatLeaderboardPercentile,
  type LeaderboardContextIndex,
  type LeaderboardContextLine,
  type LeaderboardRowContext,
} from "./leaderboard-context";
export {
  CAREER_LONGEVITY_OF_PEAK,
  CAREER_PRIME_OF_PEAK,
  CAREER_RESUME_METHODOLOGY,
  CAREER_RESUME_MIN_GAMES,
  CAREER_RESUME_MIN_MPG,
  computeCareerResume,
  careerProductionIndex,
  dedupeCareerSeasons,
  formatCpi,
  formatOfPeak,
  formatTsContext,
  isCareerQualifyingSeason,
  type CareerPhase,
  type CareerResume,
  type CareerResumeMethodology,
  type CareerSeasonScore,
  type CareerTransitionSummary,
} from "./career-resume";
export {
  GAME_LAB_METHODOLOGY,
  GAME_LAB_TOLERANCE,
  GAME_LAB_VERSION,
  analyzeGame,
  buildGameFlow,
  computeWinningFactors,
  sumTeamTotals,
  type GameAnalysisSummary,
  type GameFlowPeriod,
  type GameFlowSummary,
  type GameLabDataCoverage,
  type GameLabDepth,
  type GameLabSide,
  type GamePlayerHighlight,
  type GamePlayerHighlights,
  type GameTeamContextMetric,
  type GameTeamTotals,
  type GameWinningFactor,
} from "./game-lab";
