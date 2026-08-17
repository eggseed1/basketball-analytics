import type { StatContext, StatPopulation } from "./types";

export function buildStatContext(input: {
  display: string;
  value?: number;
  unit?: StatContext["unit"];
  percentile?: number;
  population?: StatPopulation;
  populationLabel?: string;
  sampleSize?: number;
  vsCareer?: number;
  vsLeague?: number;
  vsPrior?: number;
  timeframe?: string;
  sourceLabel?: string;
  learnHref?: string;
}): StatContext {
  const ctx: StatContext = {
    display: input.display,
  };
  if (input.value != null && Number.isFinite(input.value)) ctx.value = input.value;
  if (input.unit) ctx.unit = input.unit;
  if (input.percentile != null && Number.isFinite(input.percentile)) {
    ctx.percentile = Math.max(0, Math.min(100, input.percentile));
  }
  if (input.population) ctx.population = input.population;
  if (input.populationLabel) ctx.populationLabel = input.populationLabel;
  if (input.sampleSize != null && input.sampleSize >= 0) {
    ctx.sampleSize = input.sampleSize;
  }
  if (input.vsCareer != null && Number.isFinite(input.vsCareer)) {
    ctx.vsCareer = input.vsCareer;
  }
  if (input.vsLeague != null && Number.isFinite(input.vsLeague)) {
    ctx.vsLeague = input.vsLeague;
  }
  if (input.vsPrior != null && Number.isFinite(input.vsPrior)) {
    ctx.vsPrior = input.vsPrior;
  }
  if (input.timeframe) ctx.timeframe = input.timeframe;
  if (input.sourceLabel) ctx.sourceLabel = input.sourceLabel;
  if (input.learnHref) ctx.learnHref = input.learnHref;
  return ctx;
}

/** Short Level-2 sentence from a StatContext (no invented claims). */
export function contextBlurb(ctx: StatContext): string {
  const parts: string[] = [];
  if (ctx.percentile != null) {
    const p = Math.round(ctx.percentile);
    const pop = ctx.populationLabel ?? "qualified peers";
    parts.push(`${ordinal(p)} percentile among ${pop}`);
  }
  if (ctx.sampleSize != null) {
    parts.push(`n=${ctx.sampleSize}`);
  }
  if (ctx.timeframe) parts.push(ctx.timeframe);
  return parts.join(" · ");
}

function ordinal(n: number): string {
  const v = Math.abs(Math.round(n)) % 100;
  const d = v % 10;
  if (v > 10 && v < 14) return `${Math.round(n)}th`;
  if (d === 1) return `${Math.round(n)}st`;
  if (d === 2) return `${Math.round(n)}nd`;
  if (d === 3) return `${Math.round(n)}rd`;
  return `${Math.round(n)}th`;
}
