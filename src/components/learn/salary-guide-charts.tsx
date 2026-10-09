import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import type {
  BooksSeason,
  CapHistoryPoint,
  CapLines,
  CapZone,
  ContractCellKind,
  ContractExample,
  OptionExample,
  SurplusBand,
  TeamPayroll,
  TeamPicks,
  ValuedContractExample,
  WorthScatter,
  YearAhead,
} from "@/data/queries/salary-learn";
import { type } from "@/lib/design-system";
import { formatUsdCompact, formatUsdSignedCompact } from "@/lib/format-money";
import { teamSalaryHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

const POSITIVE = "var(--chart-3)";
const NEGATIVE = "var(--destructive)";
const PLAYER_OPTION = "var(--positive, #16a34a)";
const TEAM_OPTION = "#0284c7";

function pctOf(value: number, low: number, high: number): number {
  return ((value - low) / (high - low || 1)) * 100;
}

// ---- Cap lines

export const CAP_ZONES: Array<{ id: CapZone; label: string; fill: string }> = [
  { id: "under-cap", label: "Under the cap", fill: `color-mix(in oklab, ${POSITIVE} 16%, transparent)` },
  { id: "over-cap", label: "Over the cap", fill: "color-mix(in oklab, var(--foreground) 5%, transparent)" },
  { id: "tax", label: "Paying tax", fill: "color-mix(in oklab, #f59e0b 14%, transparent)" },
  { id: "apron1", label: "Over the first apron", fill: "color-mix(in oklab, #f59e0b 26%, transparent)" },
  { id: "apron2", label: "Over the second apron", fill: `color-mix(in oklab, ${NEGATIVE} 20%, transparent)` },
];

function zoneOf(payroll: number, lines: CapLines): CapZone {
  if (payroll >= lines.apron2) return "apron2";
  if (payroll >= lines.apron1) return "apron1";
  if (payroll >= lines.tax) return "tax";
  if (payroll >= lines.cap) return "over-cap";
  return "under-cap";
}

function capNote(payroll: number, lines: CapLines): string {
  const zone = zoneOf(payroll, lines);
  const gap = (line: number) => formatUsdCompact(Math.abs(payroll - line));
  switch (zone) {
    case "under-cap":
      return `${gap(lines.cap)} under the cap`;
    case "over-cap":
      return `${gap(lines.cap)} over the cap, ${gap(lines.tax)} under the tax`;
    case "tax":
      return `${gap(lines.tax)} into the tax`;
    case "apron1":
      return `${gap(lines.apron1)} over the first apron`;
    default:
      return `${gap(lines.apron2)} over the second apron`;
  }
}

/** All 30 payrolls on one axis, with the cap, tax and both aprons drawn through them. */
export function CapStrip({ lines, teams }: { lines: CapLines; teams: TeamPayroll[] }) {
  const values = [...teams.map((t) => t.payroll), lines.cap, lines.apron2, lines.minimum ?? lines.cap];
  const step = 10_000_000;
  const low = Math.floor((Math.min(...values) * 0.97) / step) * step;
  const high = Math.ceil((Math.max(...values) * 1.02) / step) * step;
  const at = (v: number) => pctOf(v, low, high);

  // Stack logos into lanes so close payrolls don't cover each other.
  const MIN_GAP = 3.4;
  const laneEnds: number[] = [];
  const placed = teams.map((team) => {
    const x = at(team.payroll);
    let lane = laneEnds.findIndex((end) => x - end >= MIN_GAP);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = x;
    return { team, x, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  const marks = [
    { label: "Cap", value: lines.cap },
    { label: "Tax", value: lines.tax },
    { label: "Apron 1", value: lines.apron1 },
    { label: "Apron 2", value: lines.apron2 },
  ];
  const zoneEdges: Array<[CapZone, number, number]> = [
    ["under-cap", low, lines.cap],
    ["over-cap", lines.cap, lines.tax],
    ["tax", lines.tax, lines.apron1],
    ["apron1", lines.apron1, lines.apron2],
    ["apron2", lines.apron2, high],
  ];
  const counts = new Map<CapZone, number>();
  for (const t of teams) counts.set(zoneOf(t.payroll, lines), (counts.get(zoneOf(t.payroll, lines)) ?? 0) + 1);

  return (
    <figure className="flex flex-col gap-3">
      <div className="relative w-full" style={{ height: lanes * 24 + 44 }}>
        {zoneEdges.map(([zone, from, to]) => (
          <div
            key={zone}
            aria-hidden
            className="absolute bottom-5 top-5"
            style={{
              left: `${at(from)}%`,
              width: `${at(to) - at(from)}%`,
              background: CAP_ZONES.find((z) => z.id === zone)!.fill,
            }}
          />
        ))}
        {marks.map((mark, i) => (
          <div key={mark.label} aria-hidden className="absolute bottom-5 top-0" style={{ left: `${at(mark.value)}%` }}>
            <div className="absolute bottom-0 top-5 w-px -translate-x-1/2 bg-foreground/45" />
            <span
              className={cn(
                type.micro,
                "absolute top-0 -translate-x-1/2 whitespace-nowrap font-semibold text-muted-foreground",
                i % 2 === 1 && "max-sm:hidden"
              )}
            >
              {mark.label}
            </span>
          </div>
        ))}
        <ul aria-label={`Team payrolls for ${lines.season}`}>
          {placed.map(({ team, x, lane }) => (
            <li
              key={team.teamId}
              className="absolute -translate-x-1/2"
              style={{ left: `${x}%`, top: 22 + lane * 24 }}
            >
              <Link
                href={teamSalaryHref(team.key, "contracts")}
                data-hover-item
                data-tip={`${team.abbr} · ${formatUsdCompact(team.payroll)}`}
                data-tip-sub={capNote(team.payroll, lines)}
                className="block rounded-full bg-background/90 p-0.5 shadow-sm ring-1 ring-border/60"
                aria-label={`${team.abbr}: ${formatUsdCompact(team.payroll)}, ${capNote(team.payroll, lines)}`}
              >
                <TeamLogo teamKey={team.key} size="xs" />
              </Link>
            </li>
          ))}
        </ul>
        <span className={cn(type.micro, "absolute bottom-0 left-0 tabular-nums text-muted-foreground")}>
          {formatUsdCompact(low)}
        </span>
        <span className={cn(type.micro, "absolute bottom-0 right-0 tabular-nums text-muted-foreground")}>
          {formatUsdCompact(high)}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CAP_ZONES.map((zone) => (
          <li key={zone.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
            <span aria-hidden className="size-3 shrink-0 rounded-sm ring-1 ring-border/60" style={{ background: zone.fill }} />
            <span className={cn(type.caption, "leading-tight")}>
              {zone.label}
              <span className="ml-1 font-semibold tabular-nums">{counts.get(zone.id) ?? 0}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ---- Cap growth

export function CapGrowthBars({ points, salary }: { points: CapHistoryPoint[]; salary: number }) {
  const max = Math.max(...points.map((p) => p.cap));
  const firstProjected = points.findIndex((p) => p.projected);
  const labeled = new Set([0, firstProjected, points.length - 1]);
  return (
    <figure className="flex flex-col gap-2">
      <ol className="flex h-56 items-end gap-1 sm:gap-1.5" aria-label="Salary cap by season">
        {points.map((p, i) => {
          const share = (salary / p.cap) * 100;
          return (
            <li
              key={p.season}
              data-hover-item
              data-tip={`${p.season}${p.projected ? " (projected)" : ""} · ${formatUsdCompact(p.cap)}`}
              data-tip-sub={`${formatUsdCompact(salary)} would be ${share.toFixed(1)}% of the cap`}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <div
                data-motion-bar="y"
                data-tip-anchor
                className={cn("w-full rounded-t-sm", p.projected && "border border-dashed border-foreground/40")}
                style={
                  {
                    height: `${(p.cap / max) * 88}%`,
                    background: p.projected
                      ? "color-mix(in oklab, var(--foreground) 8%, transparent)"
                      : "color-mix(in oklab, var(--foreground) 55%, transparent)",
                    "--i": i,
                  } as CSSProperties
                }
              />
              <span className={cn(type.micro, "h-4 whitespace-nowrap tabular-nums text-muted-foreground")}>
                {labeled.has(i) ? p.season : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

// ---- Contracts

const KIND_STYLE: Record<ContractCellKind, { label: string; style: CSSProperties; className?: string }> = {
  guaranteed: {
    label: "Guaranteed",
    style: { background: "color-mix(in oklab, var(--foreground) 9%, transparent)" },
  },
  player: {
    label: "Player option",
    style: { background: `color-mix(in oklab, ${PLAYER_OPTION} 18%, transparent)`, color: PLAYER_OPTION },
  },
  team: {
    label: "Team option",
    style: { background: `color-mix(in oklab, ${TEAM_OPTION} 16%, transparent)`, color: TEAM_OPTION },
  },
  partial: {
    label: "Not fully guaranteed",
    style: { background: "transparent" },
    className: "italic border border-dashed border-foreground/40",
  },
};

export function ContractKindKey() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {(Object.keys(KIND_STYLE) as ContractCellKind[]).map((kind) => (
        <li key={kind} className={cn(type.caption, "flex items-center gap-1.5")}>
          <span aria-hidden className={cn("h-3 w-5 rounded-sm", KIND_STYLE[kind].className)} style={KIND_STYLE[kind].style} />
          {KIND_STYLE[kind].label}
        </li>
      ))}
    </ul>
  );
}

const FEATURE_NOTE: Record<ContractExample["feature"], string> = {
  player: "Ends in a player option",
  team: "Starts with a team option",
  partial: "Has a year that isn't fully guaranteed",
};

export function ContractAnatomy({ examples, seasons }: { examples: ContractExample[]; seasons: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-separate border-spacing-1">
          <thead>
            <tr className={cn(type.micro, "text-left font-semibold uppercase tracking-wide text-muted-foreground")}>
              <th className="w-44 font-semibold">Contract</th>
              {seasons.map((s) => (
                <th key={s} className="text-center font-semibold tabular-nums">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {examples.map((ex) => (
              <tr key={ex.brefId}>
                <th scope="row" className="pr-2 text-left align-middle font-normal">
                  <span className={cn(type.bodySm, "flex items-center gap-1.5 font-semibold")}>
                    <TeamLogo teamKey={ex.teamKey} size="xs" />
                    {ex.name}
                  </span>
                  <span className={cn(type.micro, "block text-muted-foreground")}>{FEATURE_NOTE[ex.feature]}</span>
                </th>
                {seasons.map((season) => {
                  const cell = ex.seasons.find((s) => s.season === season);
                  if (!cell) return <td key={season} />;
                  const kind = KIND_STYLE[cell.kind];
                  return (
                    <td
                      key={season}
                      data-tip={`${ex.name} · ${season}`}
                      data-tip-sub={`${formatUsdCompact(cell.amount)} · ${kind.label}`}
                      className={cn(type.caption, "rounded-md px-1.5 py-2 text-center font-semibold tabular-nums", kind.className)}
                      style={kind.style}
                    >
                      {formatUsdCompact(cell.amount)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ContractKindKey />
    </div>
  );
}

type Column = {
  key: string;
  value: number;
  top: string;
  below: [string, string];
  tip: string;
  tipSub: string;
  color: string;
  /** A dashed reference mark drawn across this column, in the same units as value. */
  mark?: number | null;
};

function ColumnPlot({ columns, max, label, rule }: { columns: Column[]; max: number; label: string; rule?: number }) {
  const h = (v: number) => `${(v / max) * 100}%`;
  return (
    <ol className="flex items-stretch gap-2 sm:gap-4" aria-label={label}>
      {columns.map((c, i) => (
        <li
          key={c.key}
          data-hover-item
          data-tip={c.tip}
          data-tip-sub={c.tipSub}
          className="flex min-w-0 flex-1 flex-col items-center gap-1"
        >
          <div className="relative h-44 w-full">
            {rule != null ? (
              <span aria-hidden className="absolute inset-x-[-0.5rem] border-t border-dashed border-foreground/40 sm:inset-x-[-1rem]" style={{ bottom: h(rule) }} />
            ) : null}
            <div
              data-motion-bar="y"
              data-tip-anchor
              className="absolute bottom-0 left-1/2 w-full max-w-20 -translate-x-1/2 rounded-t-md"
              style={{ height: h(c.value), background: c.color, "--i": i * 2 } as CSSProperties}
            />
            <span
              className={cn(type.micro, "absolute inset-x-0 text-center font-semibold tabular-nums")}
              style={{ bottom: `calc(${h(c.value)} + 2px)` }}
            >
              {c.top}
            </span>
            {c.mark != null ? (
              <span aria-hidden className="absolute inset-x-0 border-t-2 border-dashed border-foreground/45" style={{ bottom: h(c.mark) }} />
            ) : null}
          </div>
          <span className={cn(type.micro, "font-semibold tabular-nums")}>{c.below[0]}</span>
          <span className={cn(type.micro, "text-center text-muted-foreground")}>{c.below[1]}</span>
        </li>
      ))}
    </ol>
  );
}

/** League-wide money already committed, with the room 30 caps would leave. */
export function LeagueBooksBars({ books, caps }: { books: BooksSeason[]; caps: CapHistoryPoint[] }) {
  const capTotal = (season: string) => {
    const cap = caps.find((c) => c.season === season);
    return cap ? { total: cap.cap * 30, projected: cap.projected } : null;
  };
  const max = Math.max(...books.map((b) => Math.max(b.total, capTotal(b.season)?.total ?? 0))) * 1.12;
  return (
    <figure className="flex flex-col gap-2">
      <ColumnPlot
        label="Salary already committed across the league, by season"
        max={max}
        columns={books.map((b) => {
          const cap = capTotal(b.season);
          return {
            key: b.season,
            value: b.total,
            top: formatUsdCompact(b.total),
            below: [b.season, `${b.players} players`],
            tip: `${b.season} · ${formatUsdCompact(b.total)} committed`,
            tipSub: `${b.players} players${cap ? ` · 30 caps would be ${formatUsdCompact(cap.total)}${cap.projected ? " (projected)" : ""}` : ""}`,
            color: "color-mix(in oklab, var(--foreground) 50%, transparent)",
            mark: cap?.total ?? null,
          };
        })}
      />
      <p className={cn(type.caption, "text-muted-foreground")}>
        Bars are salary already signed. The dashed mark is 30 teams at the cap.
      </p>
    </figure>
  );
}

// ---- Worth

/** Every player last season: salary across, worth up. Above the diagonal his play covered his pay. */
export function WorthScatterChart({ data }: { data: WorthScatter }) {
  const W = 640;
  const H = 380;
  const pad = { l: 72, r: 14, t: 12, b: 36 };
  const maxSalary = Math.ceil(Math.max(...data.points.map((p) => p.salary)) / 10e6) * 10e6;
  const maxWorth = Math.ceil(Math.max(...data.points.map((p) => p.worth), maxSalary) / 20e6) * 20e6;
  const x = (v: number) => pad.l + (v / maxSalary) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / maxWorth) * (H - pad.t - pad.b);
  const above = data.points.filter((p) => p.worth >= p.salary).length;
  const labeled = new Set(
    [...data.points].sort((a, b) => b.worth - a.worth).slice(0, 3).map((p) => p.key)
  );
  const xTicks = Array.from({ length: maxSalary / 10e6 + 1 }, (_, i) => i * 10e6);
  const yTicks = Array.from({ length: maxWorth / 20e6 + 1 }, (_, i) => i * 20e6);

  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[540px]" role="img" aria-label={`Salary against worth for ${data.points.length} players in ${data.season}`}>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-border/50" strokeDasharray="3 6" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {formatUsdCompact(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - pad.b + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {formatUsdCompact(t)}
          </text>
        ))}
        <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">
          Salary
        </text>
        <text x={14} y={(pad.t + H - pad.b) / 2} transform={`rotate(-90 14 ${(pad.t + H - pad.b) / 2})`} textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">
          Worth of his play
        </text>
        <line x1={x(0)} y1={y(0)} x2={x(maxSalary)} y2={y(maxSalary)} stroke="var(--foreground)" strokeOpacity={0.45} strokeDasharray="5 4" />
        <text x={x(maxSalary) - 4} y={y(maxSalary) - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">
          Worth = salary
        </text>
        {data.points.map((p) => {
          const good = p.worth >= p.salary;
          const dot = (
            <circle
              cx={x(p.salary)}
              cy={y(p.worth)}
              r={labeled.has(p.key) ? 4.5 : 3.2}
              fill={good ? POSITIVE : NEGATIVE}
              fillOpacity={0.55}
              stroke={good ? POSITIVE : NEGATIVE}
              strokeOpacity={0.9}
              strokeWidth={0.8}
            />
          );
          const tip = {
            "data-tip": p.name,
            "data-tip-sub": `${formatUsdCompact(p.salary)} salary · ${formatUsdCompact(p.worth)} worth`,
          };
          return p.href ? (
            <a key={p.key} href={p.href} {...tip} aria-label={`${p.name}: ${tip["data-tip-sub"]}`}>
              {dot}
            </a>
          ) : (
            <g key={p.key} {...tip}>
              {dot}
            </g>
          );
        })}
        {data.points
          .filter((p) => labeled.has(p.key))
          .map((p) => (
            <text key={`l${p.key}`} x={x(p.salary) + 7} y={y(p.worth) + 3} className="pointer-events-none fill-foreground text-[10px] font-semibold">
              {p.name}
            </text>
          ))}
      </svg>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {above} of {data.points.length} players sit on or above the diagonal: their play was worth at least their
        salary. Dots along the floor played at or below replacement level, so they were worth the minimum. Hover a dot
        for the numbers, or click it to open the player.
      </p>
    </figure>
  );
}

// ---- Surplus

export function SurplusBandsChart({ bands }: { bands: SurplusBand[] }) {
  const max = Math.max(...bands.map((b) => Math.abs(b.surplus)), 1);
  return (
    <ol className="flex flex-col gap-2" aria-label="Projected surplus by salary">
      {bands.map((b, i) => {
        const width = (Math.abs(b.surplus) / max) * 50;
        const good = b.surplus >= 0;
        return (
          <li
            key={b.label}
            data-hover-item
            data-tip={`${b.label}: ${formatUsdSignedCompact(b.surplus)}`}
            data-tip-sub={`${b.positive} of ${b.contracts} deals project positive`}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_5.5rem]"
          >
            <span className={cn(type.caption, "font-semibold")}>{b.label}</span>
            <span className="relative h-5">
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
              <span
                data-motion-bar="x"
                data-tip-anchor
                className="absolute inset-y-0.5 rounded-sm"
                style={
                  {
                    left: good ? "50%" : `${50 - width}%`,
                    width: `${width}%`,
                    background: good ? POSITIVE : NEGATIVE,
                    opacity: 0.8,
                    "--i": i * 2,
                  } as CSSProperties
                }
              />
            </span>
            <span className={cn(type.caption, "text-right font-semibold tabular-nums")} style={{ color: good ? POSITIVE : NEGATIVE }}>
              {formatUsdSignedCompact(b.surplus)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function WorthByYearChart({ rows }: { rows: YearAhead[] }) {
  const max = Math.max(1, ...rows.map((r) => r.worth / r.salary)) * 1.18;
  return (
    <figure className="flex flex-col gap-2">
      <ColumnPlot
        label="Projected worth per dollar of salary, by season ahead"
        max={max}
        rule={1}
        columns={rows.map((r) => {
          const ratio = r.worth / r.salary;
          return {
            key: r.season,
            value: ratio,
            top: `$${ratio.toFixed(2)}`,
            below: [r.season, `${r.contracts} deals`],
            tip: `${r.season}: $${ratio.toFixed(2)} of worth per $1 of salary`,
            tipSub: `${r.contracts} contracts · ${formatUsdCompact(r.salary)} salary · ${formatUsdCompact(r.worth)} worth`,
            color: `color-mix(in oklab, ${Number(ratio.toFixed(2)) >= 1 ? POSITIVE : NEGATIVE} 75%, transparent)`,
          };
        })}
      />
      <p className={cn(type.caption, "text-muted-foreground")}>
        Projected worth per dollar of salary across every contract we can estimate. The dashed line is $1.00.
      </p>
    </figure>
  );
}

/** One contract season by season: salary as a tick, worth as a range with the middle estimate as a dot. */
export function ContractValueRanges({ example }: { example: ValuedContractExample }) {
  const high = Math.ceil(Math.max(...example.years.flatMap((y) => [y.worthHigh, y.salary])) / 10e6) * 10e6;
  const at = (v: number) => `${pctOf(v, 0, high)}%`;
  return (
    <figure className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2.5" aria-label={`${example.name}: salary and projected worth by season`}>
        {example.years.map((y) => (
          <li
            key={y.season}
            data-tip={`${y.season} · ${formatUsdCompact(y.salary)} salary`}
            data-tip-sub={`Worth ${formatUsdCompact(y.worth)}, likely ${formatUsdCompact(y.worthLow)} to ${formatUsdCompact(y.worthHigh)}`}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3"
          >
            <span className={cn(type.caption, "font-semibold tabular-nums")}>
              {y.season}
              {y.kind === "player" || y.kind === "team" ? (
                <span className="block font-normal" style={{ color: y.kind === "player" ? PLAYER_OPTION : TEAM_OPTION }}>
                  {y.kind === "player" ? "Player opt." : "Team opt."}
                </span>
              ) : null}
            </span>
            <span className="relative h-6">
              <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
              <span
                data-tip-anchor
                className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full"
                style={{ left: at(y.worthLow), width: `calc(${at(y.worthHigh)} - ${at(y.worthLow)})`, background: `color-mix(in oklab, ${POSITIVE} 35%, transparent)` }}
              />
              <span aria-hidden className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: at(y.worth), background: POSITIVE }} />
              <span aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded bg-foreground" style={{ left: at(y.salary) }} />
            </span>
          </li>
        ))}
      </ol>
      <div className={cn(type.micro, "ml-[5.25rem] flex justify-between tabular-nums text-muted-foreground")}>
        <span>$0</span>
        <span>{formatUsdCompact(high)}</span>
      </div>
      <ul className={cn(type.caption, "flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground")}>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-0.5 bg-foreground" /> Salary
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: POSITIVE }} /> Middle estimate of worth
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-6 rounded-full" style={{ background: `color-mix(in oklab, ${POSITIVE} 35%, transparent)` }} /> 80% range
        </li>
      </ul>
    </figure>
  );
}

/** How an option clips the range: only the side the team keeps counts toward surplus. */
export function OptionClip({ example }: { example: OptionExample }) {
  const high = Math.ceil(Math.max(example.worthHigh, example.salary) / 10e6) * 10e6;
  const at = (v: number) => pctOf(v, 0, high);
  const player = example.kind === "player";
  const keptFrom = player ? example.worthLow : example.salary;
  const keptTo = player ? example.salary : example.worthHigh;
  const color = player ? PLAYER_OPTION : TEAM_OPTION;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/70 p-3">
      <p className={cn(type.bodySm, "font-semibold")}>
        <span style={{ color }}>{player ? "Player option" : "Team option"}</span> · {example.name} ({example.abbr}),{" "}
        {example.season}
      </p>
      <div
        className="relative h-10"
        data-tip={`${formatUsdCompact(example.salary)} salary`}
        data-tip-sub={`Worth likely ${formatUsdCompact(example.worthLow)} to ${formatUsdCompact(example.worthHigh)}`}
      >
        <span
          aria-hidden
          className="absolute top-3 h-4 rounded-full"
          style={{
            left: `${at(example.worthLow)}%`,
            width: `${at(example.worthHigh) - at(example.worthLow)}%`,
            background: "color-mix(in oklab, var(--foreground) 10%, transparent)",
          }}
        />
        <span
          data-tip-anchor
          className="absolute top-3 h-4 rounded-full"
          style={{ left: `${at(keptFrom)}%`, width: `${at(keptTo) - at(keptFrom)}%`, background: `color-mix(in oklab, ${color} 45%, transparent)` }}
        />
        <span aria-hidden className="absolute bottom-0 top-0 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${at(example.salary)}%` }} />
        <span className={cn(type.micro, "absolute -bottom-1 -translate-x-1/2 whitespace-nowrap font-semibold")} style={{ left: `${at(example.salary)}%` }}>
          Salary {formatUsdCompact(example.salary)}
        </span>
      </div>
      <p className={cn(type.caption, "mt-2 text-muted-foreground")}>
        {player
          ? "If he's worth more than the salary, he opts out and the team gets nothing extra. If he's worth less, he opts in and the team takes the loss. Only the shaded part below the salary counts."
          : "If he's worth less than the salary, the team declines and loses nothing. If he's worth more, the team picks it up and keeps the gain. Only the shaded part above the salary counts."}
      </p>
    </div>
  );
}

// ---- Picks

export function FirstRoundPicksChart({ years, teams }: { years: number[]; teams: TeamPicks[] }) {
  const max = Math.max(...teams.map((t) => t.own + t.acquired), years.length);
  return (
    <figure className="flex flex-col gap-2">
      <ol
        className="grid gap-x-6 gap-y-1 sm:grid-flow-col sm:grid-cols-2"
        style={{ gridTemplateRows: `repeat(${Math.ceil(teams.length / 2)}, auto)` }}
        aria-label="First-round picks held by each team"
      >
        {teams.map((t) => (
          <li
            key={t.teamId}
            data-hover-item
            data-tip={`${t.abbr} · ${t.own + t.acquired} firsts held`}
            data-tip-sub={[
              `${t.own} own, ${t.acquired} from other teams`,
              t.owedAway ? `${t.owedAway} of its own owed away` : null,
              t.conditional ? `${t.conditional} with conditions` : null,
              t.swaps ? `${t.swaps} swap ${t.swaps === 1 ? "right" : "rights"}` : null,
              t.frozen ? `${t.frozen} frozen by the second apron` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            className="grid grid-cols-[3.25rem_minmax(0,1fr)_1.5rem] items-center gap-2"
          >
            <Link href={teamSalaryHref(t.key, "picks")} className={cn(type.caption, "flex items-center gap-1 font-semibold")}>
              <TeamLogo teamKey={t.key} size="xs" />
              {t.abbr}
            </Link>
            <span className="relative flex h-3.5" data-tip-anchor>
              <span
                data-motion-bar="x"
                className="h-full rounded-l-sm"
                style={{ width: `${(t.own / max) * 100}%`, background: "color-mix(in oklab, var(--foreground) 55%, transparent)" }}
              />
              <span
                data-motion-bar="x"
                className="h-full rounded-r-sm"
                style={{ width: `${(t.acquired / max) * 100}%`, background: POSITIVE, opacity: 0.8 }}
              />
              <span aria-hidden className="absolute inset-y-[-2px] w-px bg-foreground/40" style={{ left: `${(years.length / max) * 100}%` }} />
            </span>
            <span className={cn(type.caption, "text-right font-semibold tabular-nums")}>{t.own + t.acquired}</span>
          </li>
        ))}
      </ol>
      <ul className={cn(type.caption, "flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground")}>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-5 rounded-sm" style={{ background: "color-mix(in oklab, var(--foreground) 55%, transparent)" }} /> Its own
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-5 rounded-sm" style={{ background: POSITIVE, opacity: 0.8 }} /> From other teams
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-px bg-foreground/50" /> One a year, {years[0]} to {years.at(-1)}
        </li>
      </ul>
    </figure>
  );
}

// ---- Layout

export function GuideSection({
  id,
  eyebrow,
  title,
  lead,
  children,
  seeIt,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead: ReactNode;
  children?: ReactNode;
  seeIt?: Array<{ label: string; href: string }>;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="sports-card flex scroll-mt-24 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <p className={cn(type.micro, "font-semibold uppercase tracking-[0.14em] text-muted-foreground")}>{eyebrow}</p>
        <h2 id={`${id}-title`} className="text-[20px] font-bold tracking-tight sm:text-[22px]">
          {title}
        </h2>
        <div className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground [&_strong]:text-foreground">{lead}</div>
      </div>
      {children}
      {seeIt?.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className={cn(type.caption, "font-semibold text-muted-foreground")}>See it on the site</span>
          {seeIt.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-full bg-secondary px-3 py-1 text-[13px] font-semibold hover:bg-secondary/70">
              {link.label} →
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function GuideNote({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl text-[14px] leading-relaxed text-muted-foreground [&_strong]:text-foreground">{children}</div>;
}
