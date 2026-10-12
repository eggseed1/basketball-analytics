/**
 * Checks that every figure in an answer appears in the data the tools returned
 * or in the question itself, allowing for rounding and the usual unit changes
 * (0.585 shown as 58.5%, 143481000 shown as $143.5M). Season labels, years and
 * small counts in prose ("top 5") are not checked.
 */

export type GroundingResult = { checked: number; unmatched: string[] };

const FIGURE =
  /(-|−|\+)?\$?(?:(?:\d[\d,]*\d|\d)(?:\.\d+)?|\.\d+)(?:\s?%|\s?[KMB]\b|\s(?:thousand|million|billion)\b)?/g;
const SEASON_OR_RANGE = /\b\d{4}[-–‑‐]\d{2,4}\b|\bper[-\s]100\b|\/\s?100\b/gi;
const SCALE: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, thousand: 1e3, million: 1e6, billion: 1e9 };

type Figure = { text: string; value: number; decimals: number; percent: boolean; scale: number };

function parseFigures(text: string): Figure[] {
  const cleaned = text.replace(SEASON_OR_RANGE, " ");
  const out: Figure[] = [];
  for (const match of cleaned.matchAll(FIGURE)) {
    const raw = match[0].trim();
    const sign = /^(-|−)/.test(raw) ? -1 : 1;
    const suffix = /([KMB]|thousand|million|billion)$/.exec(raw)?.[1];
    const digits = raw.replace(/[^\d.]/g, "");
    if (!digits || digits === ".") continue;
    const value = Number(digits) * sign;
    if (!Number.isFinite(value)) continue;
    const decimals = digits.includes(".") ? digits.split(".")[1]!.length : 0;
    const percent = raw.includes("%");
    if (!percent && !suffix && !raw.includes("$") && decimals === 0) {
      const n = Math.abs(value);
      if (n <= 10) continue;
      if (n >= 1946 && n <= 2100) continue;
    }
    out.push({ text: raw, value, decimals, percent, scale: suffix ? SCALE[suffix]! : 1 });
  }
  return out;
}

function collectNumbers(value: unknown, into: number[]): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.push(value);
    return;
  }
  if (typeof value === "string") {
    for (const f of parseFigures(value)) into.push(f.value * f.scale);
    for (const m of value.matchAll(/\d+(?:\.\d+)?/g)) into.push(Number(m[0]));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, into);
  }
}

function matches(figure: Figure, source: number): boolean {
  const tolerance = 0.5 * 10 ** -figure.decimals + 1e-9;
  const target = Math.abs(figure.value);
  const candidates = [source, source * 100, source / figure.scale, (source * 100) / figure.scale];
  return candidates.some((c) => Math.abs(Math.abs(c) - target) <= tolerance);
}

export function checkGrounding(answer: string, toolOutputs: unknown[], question = ""): GroundingResult {
  const figures = parseFigures(answer);
  const sources: number[] = [];
  for (const output of [...toolOutputs, question]) collectNumbers(output, sources);
  const unmatched = figures.filter((f) => !sources.some((s) => matches(f, s))).map((f) => f.text);
  return { checked: figures.length, unmatched: [...new Set(unmatched)] };
}
