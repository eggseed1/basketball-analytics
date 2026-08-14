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
