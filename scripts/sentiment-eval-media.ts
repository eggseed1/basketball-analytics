/**
 * Scores the labeled media mentions in data/sentiment/eval/v1 with the current
 * headline lexicon and compares against the stored v1.1 title scores. Even rows
 * were used to tune v1.2; odd rows are the holdout.
 */
import { readFileSync } from "node:fs";
import { scoreHeadline } from "@/sentiment/headline-lexicon";
type Item = { key: string; playerName: string; title: string; label: number | string; headlineNoSelfNameScore: number };
const SHOW = process.argv[2] ?? "summary";
function rank(xs: number[]) { const s = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]); const r = Array<number>(xs.length); for (let i = 0; i < s.length;) { let j = i; while (j + 1 < s.length && s[j + 1]![0] === s[i]![0]) j++; for (let k = i; k <= j; k++) r[s[k]![1]] = (i + j) / 2; i = j + 1; } return r; }
function pearson(a: number[], b: number[]) { const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i]! - ma) * (b[i]! - mb); va += (a[i]! - ma) ** 2; vb += (b[i]! - mb) ** 2; } return c / Math.sqrt(va * vb); }
const cls = (v: number) => (v > 0.15 ? 1 : v < -0.15 ? -1 : 0);
async function main() {
  const all = (JSON.parse(readFileSync("data/sentiment/eval/v1/media-headline-vs-article-2026-10.json", "utf8")).items as Item[]).map((it, i) => ({ ...it, i }));
  const scored = all.filter((it) => typeof it.label === "number") as (Item & { i: number; label: number })[];
  for (const [name, half] of [["dev (even)", scored.filter((x) => x.i % 2 === 0)], ["holdout (odd)", scored.filter((x) => x.i % 2 === 1)], ["all", scored]] as const) {
    const labels = half.map((x) => x.label);
    const oldS = half.map((x) => x.headlineNoSelfNameScore);
    const newS = half.map((x) => scoreHeadline(x.title, "", [x.playerName]).score);
    const agree = (s: number[]) => s.filter((v, k) => cls(v) === labels[k]).length / s.length;
    const signRight = (s: number[]) => s.filter((v, k) => labels[k] !== 0 && Math.sign(v) === labels[k]).length / labels.filter((l) => l !== 0).length;
    console.log(`${name.padEnd(14)} n=${half.length}  rho old ${pearson(rank(oldS), rank(labels)).toFixed(2)} new ${pearson(rank(newS), rank(labels)).toFixed(2)}  3-way agree old ${agree(oldS).toFixed(2)} new ${agree(newS).toFixed(2)}  direction old ${signRight(oldS).toFixed(2)} new ${signRight(newS).toFixed(2)}`);
  }
  if (SHOW === "dev") for (const x of scored.filter((x) => x.i % 2 === 0)) {
    const t = scoreHeadline(x.title, "", [x.playerName]);
    if (cls(t.score) !== x.label) console.log(`#${x.i} label ${x.label} score ${t.score} [${t.hits.join(" ")}] ${x.title}`);
  }
}
main();
