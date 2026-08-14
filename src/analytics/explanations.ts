/**
 * Metric pedagogy links. Full copy lives on /learn/[slug].
 * Keep this registry small and data-backed.
 */

export type MetricExplanation = {
  id: string;
  label: string;
  /** One-line plain English. */
  plain: string;
  learnHref: string;
};

const REGISTRY: Record<string, MetricExplanation> = {
  darko: {
    id: "darko",
    label: "DARKO",
    plain: "Estimated points per 100 possessions above or below average.",
    learnHref: "/learn/darko",
  },
  trueShooting: {
    id: "trueShooting",
    label: "True shooting",
    plain: "Scoring efficiency that folds in twos, threes, and free throws.",
    learnHref: "/learn/true-shooting",
  },
  usage: {
    id: "usage",
    label: "Usage",
    plain: "Share of team possessions used while the player is on the floor.",
    learnHref: "/learn/usage",
  },
  lebron: {
    id: "lebron",
    label: "LEBRON",
    plain: "Plus-minus style impact estimate with offensive and defensive splits.",
    learnHref: "/learn/lebron",
  },
};

export function explainMetric(id: string): MetricExplanation | null {
  return REGISTRY[id] ?? null;
}

export function listExplainedMetrics(): MetricExplanation[] {
  return Object.values(REGISTRY);
}
