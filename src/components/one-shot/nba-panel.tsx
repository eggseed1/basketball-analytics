"use client";

import { useState } from "react";

import { ROLE_LABEL } from "@/one-shot/career";
import { isNbaRookie, nbaSeasonTotal } from "@/one-shot/engine";
import { CALIBRATION, closest, LEAGUE_FIRST_SEASON, LEAGUE_SEASON, POOL_GAMES, races, REAL_AWARDS, standings, type Race } from "@/one-shot/league";
import type { LifeState, SeasonLine } from "@/one-shot/types";

import { Chip, OS, Panel, Segmented, ordinal } from "./ui";

type Tab = "league" | "races" | "career";

const nbaLines = (life: LifeState) => [...life.seasons, ...(life.season ? [life.season] : [])].filter((x) => x.node === "nba" && x.gp > 0);

export function hasNbaSeason(life: LifeState) {
  return nbaLines(life).length > 0;
}

const seasonName = (y: number) => `${y}-${String(y + 1).slice(2)}`;

/** The season on show: the one in progress, otherwise the latest. */
function focus(life: LifeState): { line: SeasonLine; year: number | null; live: boolean } | null {
  const lines = nbaLines(life);
  const last = lines.at(-1);
  if (!last) return null;
  const year = last.nbaYear ?? null;
  const live = life.season?.node === "nba" && life.season.nbaYear === year && !life.after;
  return { line: year !== null ? (nbaSeasonTotal(life, year) ?? last) : last, year, live };
}

export function NbaPanel({ life }: { life: LifeState }) {
  const [tab, setTab] = useState<Tab>("league");
  const f = focus(life);
  if (!f) return null;
  const years = new Set(nbaLines(life).map((x) => x.nbaYear ?? x.calendarYear)).size;
  const role = f.live ? life.placement.role : f.line.role;
  return (
    <Panel id="os-nba" title="NBA" action={<Chip tone="teal">{`Season ${years} · ${ROLE_LABEL[role]}`}</Chip>}>
      <div className="-mt-1 mb-3 overflow-x-auto">
        <Segmented<Tab>
          label="NBA view"
          value={tab}
          onChange={setTab}
          className="min-w-max"
          options={[
            { value: "league", label: <span className="whitespace-nowrap">Vs the league</span> },
            { value: "races", label: <span className="whitespace-nowrap">Award races</span> },
            { value: "career", label: "Career" },
          ]}
        />
      </div>
      {tab === "league" ? <VsLeague f={f} /> : null}
      {tab === "races" ? <Races life={life} f={f} role={role} /> : null}
      {tab === "career" ? <Career life={life} /> : null}
    </Panel>
  );
}

function SeasonHead({ f }: { f: NonNullable<ReturnType<typeof focus>> }) {
  const { line, year, live } = f;
  return (
    <p className="mb-2 text-[12.5px] text-[var(--os-dim)]">
      <span className="text-[var(--os-text)]">{year !== null ? `${seasonName(year)} season` : "Latest season"}</span>
      {live ? " so far" : ""} · {line.gp} games · {line.teamName} {line.wins}-{line.losses}
    </p>
  );
}

function VsLeague({ f }: { f: NonNullable<ReturnType<typeof focus>> }) {
  const rows = standings(f.line);
  const comps = closest(f.line);
  return (
    <div>
      <SeasonHead f={f} />
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.metric.key} className="grid grid-cols-[92px_48px_1fr_auto] items-center gap-2 border-b border-[var(--os-border)]/50 py-1 text-[12px] last:border-b-0">
            <span className="text-[var(--os-dim)]">{r.metric.label}</span>
            <span className="text-right font-mono tabular-nums">{r.value === null ? "—" : r.metric.format(r.value)}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-[var(--os-panel2)]" role="meter" aria-label={`${r.metric.label} percentile`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.pct === null ? undefined : Math.round(r.pct * 100)} aria-valuetext={r.pct === null ? "no rank" : `ahead of ${Math.round(r.pct * 100)}% of the league`}>
              {r.pct !== null ? <span className="block h-full rounded-full" style={{ width: `${Math.max(2, r.pct * 100)}%`, background: r.rank !== null && r.rank <= 10 ? OS.amber : OS.teal }} /> : null}
            </span>
            <span className="min-w-[76px] whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-[var(--os-dim)]" title={r.leader ? `League leader: ${r.leader.name}, ${r.metric.format(r.metric.get(r.leader)!)}` : undefined}>
              {r.rank === null ? "—" : `${ordinal(r.rank)} of ${r.of}`}
            </span>
          </li>
        ))}
      </ul>
      {comps.length ? (
        <div className="mt-3">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--os-dim)]">Closest real {LEAGUE_SEASON} lines</h3>
          <ul className="flex flex-col gap-0.5 text-[12.5px]">
            {comps.map((c) => (
              <li key={c.name} className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="min-w-0 truncate">
                  {c.name} <span className="text-[var(--os-dim)]">{c.team}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--os-dim)]">
                  {c.pts.toFixed(1)} pts · {c.reb.toFixed(1)} reb · {c.ast.toFixed(1)} ast · {c.min.toFixed(0)} min
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-[var(--os-dim)]">
        Ranks place his per-game numbers among the real NBA players with {POOL_GAMES}+ games in {LEAGUE_SEASON} (Basketball Reference). True shooting counts players with 5+ shots a game. Amber marks a top-10 rank. A dash means no attempts, not 0.
      </p>
    </div>
  );
}

const STATUS: Record<Race["status"], { label: string; tone: "green" | "amber" | "dim" }> = {
  in: { label: "In line", tone: "green" },
  close: { label: "Close", tone: "amber" },
  out: { label: "Long shot", tone: "dim" },
};

const WON: Record<string, (award: string) => boolean> = {
  "all-star": (a) => a === "NBA All-Star",
  "all-nba": (a) => a.startsWith("All-NBA"),
  mvp: (a) => a === "NBA Most Valuable Player",
  "all-def": (a) => a.startsWith("All-Defensive"),
  roy: (a) => a === "Rookie of the Year",
  "6moy": (a) => a === "Sixth Man of the Year",
  scoring: (a) => a === "Scoring title",
};

function Races({ life, f, role }: { life: LifeState; f: NonNullable<ReturnType<typeof focus>>; role: SeasonLine["role"] }) {
  const games = f.line.wins + f.line.losses;
  const list = races(f.line, { role, rookie: f.year !== null && isNbaRookie(life, f.year), winPct: games ? f.line.wins / games : 0, gamesLeft: f.live ? Math.max(0, 82 - games) : 0 });
  const won = nbaLines(life).filter((x) => x.nbaYear === f.year).flatMap((x) => [...(x.awards ?? []), ...(x.monthly ?? [])]);
  const pct = (p: [number, number]) => `${Math.round((p[0] / Math.max(1, p[1])) * 100)}%`;
  return (
    <div>
      <SeasonHead f={f} />
      {!f.live && won.length ? (
        <p className="mb-2 text-[12.5px]">
          <span style={{ color: OS.amber }}>★</span> {won.join(" · ")}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {list.map((r) => (
          <li key={r.id} className="border-b border-[var(--os-border)]/50 py-1.5 text-[12.5px] last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.label}</span>
              {f.live ? <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip> : won.some(WON[r.id] ?? (() => false)) ? <Chip tone="green">Won</Chip> : <Chip tone="dim">Missed</Chip>}
            </div>
            <p className="mt-0.5 text-[12px] text-[var(--os-dim)]">
              {r.bar} <span className="text-[var(--os-text)]">{f.live ? "Now" : "Final"}: {r.now}</span>
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-[var(--os-dim)]">
        Honors are game rules, not a vote. Each cutoff comes from where real winners ranked by Game Score from {LEAGUE_FIRST_SEASON} to {LEAGUE_SEASON}: the top 15 held {pct(CALIBRATION.allNba)} of real All-NBA picks, and {CALIBRATION.mvpTop3[0]} of {CALIBRATION.mvpTop3[1]} MVPs ranked in the top 3.
        Box scores miss most defense, so the defensive rule matched the real Defensive Player of the Year only {CALIBRATION.dpoyFirst[0]} times in {CALIBRATION.dpoyFirst[1]}. Award voting since 2023 requires 65 games. Real {LEAGUE_SEASON} winners: {REAL_AWARDS.mvp ?? "—"} (MVP), {REAL_AWARDS.dpoy ?? "—"} (Defensive Player), {REAL_AWARDS.roy ?? "—"} (Rookie).
      </p>
    </div>
  );
}

function Career({ life }: { life: LifeState }) {
  const lines = nbaLines(life);
  const byYear = new Map<number, SeasonLine[]>();
  for (const l of lines) {
    const y = l.nbaYear ?? l.calendarYear;
    byYear.set(y, [...(byYear.get(y) ?? []), l]);
  }
  const counts = new Map<string, number[]>();
  for (const [y, ls] of byYear) for (const a of ls.flatMap((x) => x.awards ?? [])) counts.set(a, [...(counts.get(a) ?? []), y]);
  const monthly = lines.reduce((a, x) => a + (x.monthly?.length ?? 0), 0);
  const gp = lines.reduce((a, x) => a + x.gp, 0);
  const pts = lines.reduce((a, x) => a + x.pts, 0);
  const reb = lines.reduce((a, x) => a + x.reb, 0);
  const ast = lines.reduce((a, x) => a + x.ast, 0);
  const po = lines.filter((x) => x.playoffs);
  const poGp = po.reduce((a, x) => a + x.playoffs!.gp, 0);
  const flags = life.flags;
  const liveYear = life.season?.node === "nba" ? life.season.nbaYear : undefined;
  const order = ["NBA champion", "Finals MVP", "NBA Most Valuable Player", "All-NBA First Team", "All-NBA Second Team", "All-NBA Third Team", "NBA All-Star", "Defensive Player of the Year", "All-Defensive First Team", "All-Defensive Second Team", "Rookie of the Year", "All-Rookie First Team", "All-Rookie Second Team", "Sixth Man of the Year", "Most Improved Player", "Scoring title", "Rebounding title", "Assists title", "Steals title", "Blocks title", "Rising Stars", "Three-Point Contest champion", "Slam Dunk Contest champion"];
  const trophies = [...counts.entries()].sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[12px] tabular-nums sm:grid-cols-4">
        <Stat k="Games" v={gp.toLocaleString("en-US")} />
        <Stat k="Points" v={`${pts.toLocaleString("en-US")} (${gp ? (pts / gp).toFixed(1) : "—"})`} />
        <Stat k="Rebounds" v={gp ? (reb / gp).toFixed(1) : "—"} />
        <Stat k="Assists" v={gp ? (ast / gp).toFixed(1) : "—"} />
        <Stat k="Career high" v={typeof flags.nbaHigh === "number" ? `${flags.nbaHigh} pts` : "—"} />
        <Stat k="Double-doubles" v={typeof flags.nbaDD === "number" ? flags.nbaDD : "—"} />
        <Stat k="Triple-doubles" v={typeof flags.nbaTD === "number" ? flags.nbaTD : "—"} />
        <Stat k="Playoff games" v={poGp} />
      </dl>
      <div>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--os-dim)]">Honors</h3>
        {trophies.length || monthly ? (
          <ul className="flex flex-wrap gap-1.5 text-[12px]">
            {trophies.map(([name, ys]) => (
              <li key={name} className="rounded-md border border-[var(--os-border)] px-2 py-0.5" title={ys.map(seasonName).join(", ")}>
                <span style={{ color: OS.amber }}>{ys.length > 1 ? `${ys.length}× ` : "★ "}</span>
                {name}
              </li>
            ))}
            {monthly ? (
              <li className="rounded-md border border-[var(--os-border)] px-2 py-0.5">
                <span style={{ color: OS.amber }}>{monthly > 1 ? `${monthly}× ` : "★ "}</span>
                Player or Rookie of the Month
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="text-[12px] text-[var(--os-dim)]">None yet. The Award races tab shows what each one takes.</p>
        )}
      </div>
      <div className="max-h-[260px] overflow-auto">
        <table className="w-full min-w-[560px] border-collapse whitespace-nowrap text-[12px] tabular-nums">
          <thead className="sticky top-0 bg-[var(--os-panel)] text-[var(--os-dim)]">
            <tr className="text-left font-mono text-[10.5px] [&>th]:px-1.5 [&>th]:py-1 [&>th]:font-normal">
              <th>Season</th>
              <th>Team</th>
              <th className="text-right">W-L</th>
              <th>Playoffs</th>
              <th>Honors</th>
            </tr>
          </thead>
          <tbody>
            {[...byYear.entries()].reverse().map(([y, ls]) => {
              const lastLine = ls.at(-1)!;
              const honors = ls.flatMap((x) => [...(x.awards ?? []), ...(x.monthly ?? [])]);
              return (
                <tr key={y} className="border-t border-[var(--os-border)]/50 [&>td]:px-1.5 [&>td]:py-1">
                  <td className="font-mono">{seasonName(y)}</td>
                  <td className="max-w-[150px] truncate" title={ls.map((x) => x.teamName).join(", ")}>
                    {ls.length > 1 ? `${lastLine.teamName} (${ls.length} stops)` : lastLine.teamName}
                  </td>
                  <td className="text-right font-mono">
                    {lastLine.wins}-{lastLine.losses}
                  </td>
                  <td className="max-w-[190px] truncate" title={lastLine.playoffs?.series.join(" ")} style={{ color: lastLine.playoffs?.champion ? OS.amber : undefined }}>
                    {lastLine.playoffs ? lastLine.playoffs.result || `${ordinal(lastLine.playoffs.seed)} seed, in progress` : y === liveYear ? "—" : "Missed"}
                  </td>
                  <td className="max-w-[220px] truncate" title={honors.join(", ")}>
                    {honors.length ? honors.join(", ") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--os-dim)]">
        W-L is the record with his last team that season. Playoff seeding, opponents and series are a model built on that record.
      </p>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="font-sans text-[11px] text-[var(--os-dim)]">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
