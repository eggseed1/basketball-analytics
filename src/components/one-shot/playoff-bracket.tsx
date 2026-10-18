import type { LifeState, PlayoffRun, PlayoffSeries } from "@/one-shot/types";

import { OS } from "./ui";

export function clubNick(name: string) {
  if (name.startsWith("Portland ")) return "Trail Blazers";
  if (name.startsWith("Los Angeles ")) return name.slice("Los Angeles ".length);
  if (name.startsWith("LA ")) return name.slice(3);
  const rest = name.split(" ").slice(1).join(" ");
  return rest || name;
}

export function activeBracket(life: LifeState): { po: PlayoffRun; you: string } | null {
  const key = life.flags.poKey;
  if (typeof key !== "string") return null;
  const line = life.seasons.find((x) => x.key === key);
  if (!line?.playoffs?.bracket || !line.teamName) return null;
  return { po: line.playoffs, you: line.teamName };
}

const ROUND = ["First round", "Semifinals", "Conf. finals"];
const EXPECT = [4, 2, 1];

export function PlayoffBracket({ po, you }: { po: PlayoffRun; you: string }) {
  const b = po.bracket;
  if (!b) return null;
  const finals = b.series.find((s) => s.side === "Finals");
  return (
    <div className="mb-3">
      <p className="mb-2 text-[12px] text-[var(--os-dim)]">
        <span className="text-[var(--os-text)]">{po.seed} seed, {po.conference} Conference</span>
        {po.result ? ` · ${po.result}` : " · bracket in progress"}
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <Conference title="East" series={b.series.filter((s) => s.side === "Eastern")} you={you} />
        <Conference title="West" series={b.series.filter((s) => s.side === "Western")} you={you} />
      </div>
      <div className="mt-2">
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--os-dim)]">Finals</h3>
        {finals ? <Matchup series={finals} you={you} /> : <p className="text-[12px] text-[var(--os-dim)]">Conference winners meet here.</p>}
      </div>
    </div>
  );
}

function Conference({ title, series, you }: { title: string; series: PlayoffSeries[]; you: string }) {
  return (
    <section aria-label={`${title} conference bracket`}>
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--os-dim)]">{title}</h3>
      <div className="grid grid-cols-3 gap-1">
        {ROUND.map((label, round) => {
          const rows = series.filter((s) => s.round === round);
          const blanks = Math.max(0, (EXPECT[round] ?? 0) - rows.length);
          return (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] text-[var(--os-dim)]">{label}</span>
              {rows.map((s) => (
                <Matchup key={`${s.high}-${s.low}`} series={s} you={you} />
              ))}
              {Array.from({ length: blanks }, (_, i) => (
                <p key={i} className="rounded border border-dashed border-[var(--os-border)] px-1 py-1 text-[10px] text-[var(--os-dim)]">
                  —
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Matchup({ series, you }: { series: PlayoffSeries; you: string }) {
  const highWon = series.done && series.highWins > series.lowWins;
  const lowWon = series.done && series.lowWins > series.highWins;
  return (
    <div className="rounded border border-[var(--os-border)] bg-[var(--os-page)] px-1 py-0.5">
      <TeamRow name={series.high} seed={series.highSeed} wins={series.highWins} you={series.high === you} won={highWon} lost={series.done && !highWon} />
      <TeamRow name={series.low} seed={series.lowSeed} wins={series.lowWins} you={series.low === you} won={lowWon} lost={series.done && !lowWon} />
    </div>
  );
}

function TeamRow({ name, seed, wins, you, won, lost }: { name: string; seed: number; wins: number; you: boolean; won: boolean; lost: boolean }) {
  return (
    <div className="flex items-center gap-1 text-[11px] leading-4" style={{ color: you ? OS.teal : lost ? OS.dim : OS.text, fontWeight: won || you ? 600 : 400 }}>
      <span className="w-3 shrink-0 font-mono text-[10px] text-[var(--os-dim)]">{seed}</span>
      <span className="min-w-0 flex-1 truncate">{clubNick(name)}</span>
      <span className="font-mono tabular-nums">{wins}</span>
    </div>
  );
}
