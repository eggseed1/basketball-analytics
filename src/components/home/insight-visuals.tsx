import type {
  RecentInsightFocus,
  RecentInsightGame,
  RecentInsightStatLine,
  RecentInsightTrendPoint,
} from "@/lib/recent-insights";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

const FALLBACK_COLOR = "var(--foreground)";

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/**
 * Team color that stays visible on the card in both themes: silver-type
 * primaries fall back to the secondary, and pure black follows the theme.
 */
export function teamColor(teamKey?: string | null): string {
  const brand = resolveTeamBrand(teamKey);
  if (!brand) return FALLBACK_COLOR;
  let color = brand.primary;
  if ((luminance(color) ?? 0) > 0.5) color = brand.secondary;
  const lum = luminance(color);
  if (lum == null || lum < 0.02 || lum > 0.5) return FALLBACK_COLOR;
  return color;
}

/** Hex distance check so two similar team colors don't blend in one chart. */
function colorsClash(a: string, b: string): boolean {
  const rgb = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  };
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return false;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 90;
}

export function gameColors(game: RecentInsightGame): { away: string; home: string } {
  const home = teamColor(game.home.teamId);
  let away = teamColor(game.away.teamId);
  if (away === home || colorsClash(home, away)) {
    const alt = resolveTeamBrand(game.away.teamId)?.secondary;
    const lum = alt ? luminance(alt) : null;
    away =
      alt && lum != null && lum >= 0.02 && lum <= 0.5 && !colorsClash(home, alt)
        ? alt
        : "var(--muted-foreground)";
  }
  return { away, home };
}

/** Home minus away, cumulative through each period. */
function runningMargins(home: number[], away: number[]): number[] {
  const out: number[] = [];
  let margin = 0;
  for (let i = 0; i < home.length; i++) {
    margin += home[i]! - (away[i] ?? 0);
    out.push(margin);
  }
  return out;
}

function periodLabel(index: number): string {
  return index < 4 ? `Q${index + 1}` : index === 4 ? "OT" : `OT${index - 3}`;
}

/**
 * Lead at the end of each period. Bars point toward whichever team led, so a
 * comeback reads as bars flipping sides.
 */
export function InsightLeadByPeriod({
  game,
  highlightPeriod,
}: {
  game: RecentInsightGame;
  /** 0-based period to emphasize (e.g. the Q3 deficit on a comeback card). */
  highlightPeriod?: number;
}) {
  const home = game.home.periods;
  const away = game.away.periods;
  if (!home || !away) return null;
  const colors = gameColors(game);

  const margins = runningMargins(home, away);
  const maxAbs = Math.max(5, ...margins.map((m) => Math.abs(m)));

  const W = 340;
  const H = 140;
  const axisBand = 22;
  const labelPad = 16;
  const plotTop = labelPad;
  const plotBottom = H - axisBand - labelPad;
  const oneSided = margins.every((m) => m >= 0) || margins.every((m) => m <= 0);
  const homeOnly = margins.every((m) => m >= 0);
  const mid = oneSided ? (homeOnly ? plotBottom : plotTop) : (plotTop + plotBottom) / 2;
  const half = oneSided ? plotBottom - plotTop : (plotBottom - plotTop) / 2;
  const slot = W / margins.length;
  const barW = Math.min(44, slot * 0.6);

  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-[11px] font-semibold text-muted-foreground">
        Who led after each quarter
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[140px] w-full"
        role="img"
        aria-label={margins
          .map((m, i) =>
            `${periodLabel(i)}: ${m === 0 ? "tied" : `${m > 0 ? game.home.abbr : game.away.abbr} by ${Math.abs(m)}`}`
          )
          .join(", ")}
      >
        <line x1={0} x2={W} y1={mid} y2={mid} stroke="var(--border)" strokeWidth={1} />
        {margins.map((m, i) => {
          const cx = slot * i + slot / 2;
          const h = (Math.abs(m) / maxAbs) * half;
          const y = m >= 0 ? mid - h : mid;
          const color = m >= 0 ? colors.home : colors.away;
          const dim = highlightPeriod != null && highlightPeriod !== i;
          const labelY = m >= 0 ? mid - h - 4 : mid + h + 13;
          const leader = m > 0 ? game.home.abbr : game.away.abbr;
          return (
            <g key={i} opacity={dim ? 0.4 : 1}>
              {m !== 0 ? (
                <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(h, 2)} rx={3} fill={color} />
              ) : (
                <circle cx={cx} cy={mid} r={3} fill="var(--muted-foreground)" />
              )}
              <text
                x={cx}
                y={m === 0 ? mid - 7 : labelY}
                textAnchor="middle"
                className="fill-foreground text-[12px] font-bold tabular-nums"
              >
                {m === 0 ? "Tied" : `${leader} +${Math.abs(m)}`}
              </text>
              <text
                x={cx}
                y={H - 1}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {periodLabel(i)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Points scored by each team per period, side by side. */
export function InsightPeriodScoring({ game }: { game: RecentInsightGame }) {
  const home = game.home.periods;
  const away = game.away.periods;
  if (!home || !away) return null;
  const totals = home.map((h, i) => h + (away[i] ?? 0));
  const max = Math.max(...totals, 1);
  const best = totals.indexOf(max);
  const color = teamColor(game.home.teamId);
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-[11px] font-semibold text-muted-foreground">
        Points per quarter, both teams
      </figcaption>
      <div className="flex items-end gap-3">
        {totals.map((total, i) => (
          <div
            key={i}
            className="flex flex-1 flex-col items-center gap-1"
            title={`${game.away.abbr} ${away[i] ?? 0}, ${game.home.abbr} ${home[i]}`}
          >
            <span className="text-[13px] font-bold tabular-nums">{total}</span>
            <div className="flex h-[84px] w-full items-end">
              <div
                className="w-full rounded-t-[3px]"
                style={{
                  height: `${(total / max) * 100}%`,
                  background: color,
                  opacity: i === best ? 1 : 0.45,
                }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">{periodLabel(i)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Made / attempted as a filled bar. Blank when there were no attempts. */
function SplitBar({
  label,
  made,
  attempts,
  color,
}: {
  label: string;
  made: number;
  attempts: number;
  color: string;
}) {
  const pct = attempts > 0 ? made / attempts : null;
  return (
    <div className="grid grid-cols-[2rem_1fr_4.5rem] items-center gap-2 text-[11px]">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        {pct != null ? (
          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} />
        ) : null}
      </div>
      <span className="text-right tabular-nums">
        {attempts > 0 ? `${made}/${attempts}` : "—"}
        {pct != null ? (
          <span className="text-muted-foreground"> · {Math.round(pct * 100)}%</span>
        ) : null}
      </span>
    </div>
  );
}

export function InsightShootingSplits({
  line,
  color,
}: {
  line: RecentInsightStatLine;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <SplitBar label="FG" made={line.fgm} attempts={line.fga} color={color} />
      <SplitBar label="3P" made={line.threePm} attempts={line.threePa} color={color} />
      <SplitBar label="FT" made={line.ftm} attempts={line.fta} color={color} />
    </div>
  );
}

/** Every shot as a dot: filled = made, ring = missed. */
export function InsightShotDots({
  line,
  color,
}: {
  line: RecentInsightStatLine;
  color: string;
}) {
  const rows = [
    { label: "2PT", made: line.fgm - line.threePm, att: line.fga - line.threePa },
    { label: "3PT", made: line.threePm, att: line.threePa },
    { label: "FT", made: line.ftm, att: line.fta },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[2rem_1fr_2.75rem] items-center gap-2 text-[12px]">
          <span className="font-semibold text-muted-foreground">{row.label}</span>
          <div className="flex flex-wrap gap-1">
            {row.att > 0 ? (
              Array.from({ length: row.att }, (_, i) => (
                <span
                  key={i}
                  className="h-3.5 w-3.5 rounded-full border-[1.5px]"
                  style={
                    i < row.made
                      ? { background: color, borderColor: color }
                      : { borderColor: "var(--muted-foreground)", opacity: 0.55 }
                  }
                />
              ))
            ) : (
              <span className="text-muted-foreground">No attempts</span>
            )}
          </div>
          <span className="text-right tabular-nums">
            {row.att > 0 ? `${row.made}/${row.att}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Tonight against the season scoring average. Omitted when no average exists. */
export function InsightVsSeason({
  line,
  color,
}: {
  line: RecentInsightStatLine;
  color: string;
}) {
  const avg = line.seasonPpg;
  if (avg == null || !(avg > 0)) return null;
  const max = Math.max(line.points, avg);
  const diff = line.points - avg;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-[12px]">
        <span className="font-semibold">This game</span>
        <div className="h-5 overflow-hidden rounded-sm bg-secondary">
          <div className="h-full rounded-sm" style={{ width: `${(line.points / max) * 100}%`, background: color }} />
        </div>
        <span className="text-right font-bold tabular-nums">{line.points}</span>
      </div>
      <div className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-[12px] text-muted-foreground">
        <span>Season avg</span>
        <div className="h-5 overflow-hidden rounded-sm bg-secondary">
          <div
            className="h-full rounded-sm bg-muted-foreground/40"
            style={{ width: `${(avg / max) * 100}%` }}
          />
        </div>
        <span className="text-right tabular-nums">{avg.toFixed(1)}</span>
      </div>
      {Math.abs(diff) >= 1 ? (
        <p className="text-[11px] text-muted-foreground">
          <span className={cn("font-semibold", diff > 0 ? "text-delta-up" : "text-delta-down")}>
            {diff > 0 ? "+" : "−"}
            {Math.abs(diff).toFixed(0)}
          </span>{" "}
          vs his season average
        </p>
      ) : null}
    </div>
  );
}

/** One pip per event, capped so a 20-rebound night still fits. */
function Pips({ count, color, label }: { count: number; color: string; label: string }) {
  const shown = Math.min(count, 24);
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="w-8 shrink-0 font-semibold text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: shown }, (_, i) => (
          <span key={i} className="h-4 w-4 rounded-[3px]" style={{ background: color }} />
        ))}
        {count > shown ? <span className="text-muted-foreground">+{count - shown}</span> : null}
        {count === 0 ? <span className="text-muted-foreground">0</span> : null}
      </div>
      <span className="ml-auto pl-2 font-bold tabular-nums">{count}</span>
    </div>
  );
}

export function InsightEventPips({
  line,
  focus,
  color,
}: {
  line: RecentInsightStatLine;
  focus: RecentInsightFocus;
  color: string;
}) {
  if (focus === "stocks") {
    return (
      <div className="flex flex-col gap-1.5">
        <Pips count={line.blocks} color={color} label="BLK" />
        <Pips count={line.steals} color={color} label="STL" />
      </div>
    );
  }
  if (focus === "rebounds") return <Pips count={line.rebounds} color={color} label="REB" />;
  return <Pips count={line.assists} color={color} label="AST" />;
}

/** PTS / REB / AST against the double-digit line. */
export function InsightTripleDoubleBars({
  line,
  color,
}: {
  line: RecentInsightStatLine;
  color: string;
}) {
  const stats = [
    { label: "PTS", v: line.points },
    { label: "REB", v: line.rebounds },
    { label: "AST", v: line.assists },
  ];
  const max = Math.max(20, ...stats.map((s) => s.v));
  const tenPct = (10 / max) * 100;
  return (
    <div className="relative flex flex-col gap-1.5">
      {stats.map((s) => (
        <div key={s.label} className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2 text-[12px]">
          <span className="font-semibold text-muted-foreground">{s.label}</span>
          <div className="relative h-4 rounded-sm bg-secondary">
            <div
              className="h-full rounded-sm"
              style={{ width: `${(s.v / max) * 100}%`, background: s.v >= 10 ? color : "var(--muted-foreground)" }}
            />
            <span
              aria-hidden
              className="absolute inset-y-[-3px] w-px bg-foreground/60"
              style={{ left: `${tenPct}%` }}
            />
          </div>
          <span className="text-right font-bold tabular-nums">{s.v}</span>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground">Line marks 10</p>
    </div>
  );
}

/** Points in each of the last five games with the five-game average. */
export function InsightTrendBars({
  points,
  color,
}: {
  points: RecentInsightTrendPoint[];
  color: string;
}) {
  if (!points.length) return null;
  const max = Math.max(...points.map((p) => p.points), 1);
  const avg = points.reduce((s, p) => s + p.points, 0) / points.length;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex h-[76px] items-end gap-2">
        <span
          aria-hidden
          className="absolute inset-x-0 border-t border-dashed border-foreground/40"
          style={{ bottom: `${(avg / max) * 100}%` }}
        />
        {points.map((p) => (
          <div key={p.gameDate} className="flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
            <span className="text-[10px] font-semibold tabular-nums">{p.points}</span>
            <div className="w-full rounded-t-sm" style={{ height: `${(p.points / max) * 80}%`, background: color }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {points.map((p) => (
          <span key={p.gameDate} className="flex-1 text-center text-[9px] text-muted-foreground">
            {p.opponentAbbr}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Dashed line is the five-game average ({avg.toFixed(1)})</p>
    </div>
  );
}

/** One-line box score; the stat the card is about stays bold. */
export function InsightStatLine({
  line,
  focus,
}: {
  line: RecentInsightStatLine;
  focus?: RecentInsightFocus;
}) {
  const cells: Array<{ label: string; v: number; on: boolean }> = [
    { label: "PTS", v: line.points, on: focus === "points" || focus === "efficiency" || focus === "trend" || focus === "triple_double" },
    { label: "REB", v: line.rebounds, on: focus === "rebounds" || focus === "triple_double" },
    { label: "AST", v: line.assists, on: focus === "assists" || focus === "triple_double" },
    { label: "STL", v: line.steals, on: focus === "stocks" },
    { label: "BLK", v: line.blocks, on: focus === "stocks" },
    { label: "MIN", v: line.minutes, on: false },
  ];
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums text-muted-foreground">
      {cells.map((c) => (
        <span key={c.label} className={cn(c.on && "font-bold text-foreground")}>
          {Math.round(c.v)} {c.label}
        </span>
      ))}
    </p>
  );
}

/** Final score on one line, winner in bold. */
export function InsightFinalScore({ game }: { game: RecentInsightGame }) {
  const homeWon = game.home.score > game.away.score;
  const side = (s: RecentInsightGame["home"], won: boolean) => (
    <span className={cn("inline-flex items-center gap-1.5", won ? "font-bold text-foreground" : "text-muted-foreground")}>
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: teamColor(s.teamId) }} />
      {s.abbr} <span className="tabular-nums">{s.score}</span>
    </span>
  );
  return (
    <p className="flex items-center gap-2.5 text-[13px]">
      {side(game.away, !homeWon)}
      {side(game.home, homeWon)}
    </p>
  );
}
