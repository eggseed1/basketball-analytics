/**
 * ASK DRBL — natural-language interface to trusted basketball queries.
 *
 * Pipeline (mandatory):
 *   natural language → intent → BasketballQueryAst → validate → execute → result
 *
 * Never let an LLM emit arbitrary SQL, mutate storage, or bypass validation.
 * Only compile dimensions the data layer can support.
 */

export type {
  AskDrblResult,
  AskDrblStatus,
  AskMetricDef,
  AskMetricId,
  AskQueryPlanRow,
  BasketballQueryAst,
  QueryEntity,
  QueryEvent,
  QueryMetric,
  QueryOperation,
  QuerySituation,
  QueryValidation,
  QueryWhen,
  QueryWhere,
} from "./types";

export {
  ASK_DRBL_EXAMPLE_PROMPTS,
  ASK_DRBL_VERSION,
} from "./types";

export { ASK_METRICS, resolveMetric } from "./metrics";
export { resolveSeasonPhrases, extractCanonicalSeasons } from "./seasons";
export { detectUnsupportedClauses } from "./unsupported";
export { planPartialSupport } from "./partial";
export {
  getAskMetricCoverageAudit,
  metricSeasonAvailability,
  formatCoverageReportMarkdown,
  coverageForMetric,
} from "./coverage";
export { buildQueryPlan, buildFollowUpLinks } from "./followups";
export { interpretAskQuery } from "./interpret";
export { validateBasketballQuery } from "./validate";
export { executeBasketballQuery } from "./execute";
export { resolveQueryEntities, searchNbaEntities } from "./entities";
export { runAskDrbl, type RunAskDrblOptions } from "./run";
export {
  ASK_EXAMPLE_POOL,
  ASK_EXAMPLE_DISPLAY_CLASSES,
  displayClassesForSeed,
  pickAskExamples,
  daySeed,
  hashSeed,
  askExampleDiversityReport,
  type AskExample,
  type AskExampleClass,
} from "./ask-examples";
export {
  ASK_BUILDER_OPERATIONS,
  composeAskBuilderQuery,
  validateAskBuilderState,
  parseAskBuilderParams,
  serializeAskBuilderParams,
  askBuilderHref,
  defaultAskBuilderState,
  listBuilderSeasons,
  listBuilderTeams,
  listBuilderPlayerSuggestions,
  metricsForBuilderOperation,
  builderOption,
  askBuilderPreviewLabel,
  type AskBuilderState,
  type AskBuilderOperation,
  type AskInputMode,
} from "./ask-builder";
