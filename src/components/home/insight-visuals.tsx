import type {
  RecentInsightFocus,
  RecentInsightGame,
  RecentInsightStatLine,
  RecentInsightTrendPoint,
  SurpriseStat,
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

/** "after Q1", "at halftime", ... for the end of a 0-based period. */
function periodEnd(index: number): string {
  if (index === 1) return "at halftime";
  if (index === 3) return "after regulation";
  return `after ${periodLabel(index)}`;
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

/** Period scores that add up to the final on both sides, or null. */
function consistentPeriods(game: RecentInsightGame): { home: number[]; away: number[] } | null {
  const home = game.home.periods;
  const away = game.away.periods;
  if (!home?.length || !away?.length || home.length !== away.length) return null;
  if (sum(home) !== game.home.score || sum(away) !== game.away.score) return null;
  return { home, away };
}

/** One-sentence takeaway for the lead chart, built only from quarter-end margins. */
function leadStory(game: RecentInsightGame, margins: number[], focus?: RecentInsightFocus): string {
  const homeWon = game.home.score > game.away.score;
  const winner = homeWon ? game.home.abbr : game.away.abbr;
  const loser = homeWon ? game.away.abbr : game.home.abbr;
  const final = Math.abs(game.home.score - game.away.score);
  const forWinner = margins.map((m) => (homeWon ? m : -m));

  if (focus === "overtime" && margins.length > 4 && margins[3] === 0) {
    const reg = (side: number[] | undefined) => sum((side ?? []).slice(0, 4));
    return `Tied ${reg(game.away.periods)}-${reg(game.home.periods)} after regulation. ${winner} won by ${final} in overtime.`;
  }
  if (focus === "comeback" && forWinner.length >= 3 && forWinner[2]! < 0) {
    return `${winner} trailed by ${-forWinner[2]!} after three quarters and won by ${final}.`;
  }
  const loserBest = Math.min(...forWinner);
  if (loserBest < 0 && focus !== "margin") {
    const at = forWinner.indexOf(loserBest);
    return `${loser} led by ${-loserBest} ${periodEnd(at)}. ${winner} won by ${final}.`;
  }
  if (forWinner.slice(0, -1).every((m) => m > 0)) {
    return `${winner} led after every quarter and won by ${final}.`;
  }
  const biggest = Math.max(...forWinner);
  const at = forWinner.indexOf(biggest);
  return `${winner}'s biggest lead at a quarter break was ${biggest}, ${periodEnd(at)}.`;
}

/**
 * Lead at each quarter break as a line around zero, shaded in the leading
 * team's color. Only quarter-end margins are plotted, so the dots are the data.
 */
export function InsightLeadWorm({
  game,
  focus,
}: {
  game: RecentInsightGame;
  focus?: RecentInsightFocus;
}) {
  const periods = consistentPeriods(game);
  if (!periods) return null;
  const colors = gameColors(game);
  const margins = runningMargins(periods.home, periods.away);
  const series = [0, ...margins];
  // Fit the scale to the margins actually reached, at least 8 points tall.
  let hi = Math.max(...series);
  let lo = Math.min(...series);
  if (hi - lo < 8) {
    if (lo === 0) hi = 8;
    else if (hi === 0) lo = -8;
    else {
      const pad = (8 - (hi - lo)) / 2;
      hi += pad;
      lo -= pad;
    }
  }

  const W = 340;
  const H = 132;
  const padX = 34;
  const padRight = 22;
  const top = 20;
  const bottom = H - 36;
  const x = (i: number) => padX + (i * (W - padX - padRight)) / (series.length - 1);
  const y = (m: number) => top + ((hi - m) / (hi - lo || 1)) * (bottom - top);
  const mid = y(0);
  const line = series.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${mid} L${x(0).toFixed(1)},${mid} Z`;
  const clipId = `lead-${game.away.abbr}-${game.home.abbr}-${game.home.score}-${game.away.score}`;

  const homeMax = Math.max(...margins);
  const awayMax = Math.min(...margins);
  const labelAt = new Set<number>([margins.length - 1]);
  if (homeMax > 0) labelAt.add(margins.indexOf(homeMax));
  if (awayMax < 0) labelAt.add(margins.indexOf(awayMax));

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-[13px] font-semibold leading-snug">
        {leadStory(game, margins, focus)}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[124px] w-full overflow-visible"
        role="img"
        aria-label={margins
          .map((m, i) =>
            `${periodLabel(i)}: ${m === 0 ? "tied" : `${m > 0 ? game.home.abbr : game.away.abbr} by ${Math.abs(m)}`}`
          )
          .join(", ")}
      >
        <defs>
          <clipPath id={`${clipId}-top`}>
            <rect x={0} y={0} width={W} height={mid} />
          </clipPath>
          <clipPath id={`${clipId}-bottom`}>
            <rect x={0} y={mid} width={W} height={H - mid} />
          </clipPath>
        </defs>
        <text x={0} y={mid - 5} className="text-[11px] font-bold" fill={colors.home}>
          {game.home.abbr}
        </text>
        <text x={0} y={mid + 14} className="text-[11px] font-bold" fill={colors.away}>
          {game.away.abbr}
        </text>
        <line x1={padX} x2={W - padRight} y1={mid} y2={mid} stroke="var(--border)" strokeWidth={1} />
        {margins.map((_, i) => (
          <line
            key={i}
            x1={x(i + 1)}
            x2={x(i + 1)}
            y1={top}
            y2={bottom}
            stroke="var(--border)"
            strokeDasharray="2 3"
            strokeWidth={1}
            opacity={0.6}
          />
        ))}
        <path d={area} fill={colors.home} opacity={0.2} clipPath={`url(#${clipId}-top)`} />
        <path d={area} fill={colors.away} opacity={0.2} clipPath={`url(#${clipId}-bottom)`} />
        <path d={line} fill="none" stroke={colors.home} strokeWidth={2.5} strokeLinejoin="round" clipPath={`url(#${clipId}-top)`} />
        <path d={line} fill="none" stroke={colors.away} strokeWidth={2.5} strokeLinejoin="round" clipPath={`url(#${clipId}-bottom)`} />
        {margins.map((m, i) => {
          const cx = x(i + 1);
          const cy = y(m);
          const fill = m > 0 ? colors.home : m < 0 ? colors.away : "var(--muted-foreground)";
          const show = labelAt.has(i);
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={show ? 4.5 : 3.5} fill="var(--card)" stroke={fill} strokeWidth={2.5} />
              {show ? (
                <text
                  x={cx}
                  y={m >= 0 ? cy - 9 : cy + 17}
                  textAnchor="middle"
                  className="text-[12px] font-bold tabular-nums"
                  fill={m === 0 ? "var(--muted-foreground)" : fill}
                >
                  {m === 0 ? "Tied" : `+${Math.abs(m)}`}
                </text>
              ) : null}
              <text x={cx} y={H - 2} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {periodLabel(i)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Each quarter's points stacked by team, so the big quarter and who drove it both show. */
export function InsightQuarterStack({
  game,
  focusPeriod,
}: {
  game: RecentInsightGame;
  /** Highlight this 0-based period instead of the highest-scoring one. */
  focusPeriod?: number;
}) {
  const periods = consistentPeriods(game);
  if (!periods) return null;
  const colors = gameColors(game);
  const totals = periods.home.map((h, i) => h + periods.away[i]!);
  const max = Math.max(...totals, 1);
  const best = focusPeriod ?? totals.indexOf(max);
  return (
    <figure className="flex flex-col gap-2">
      {focusPeriod == null ? (
        <figcaption className="text-[13px] font-semibold leading-snug">
          {periodLabel(best)} had {max} points, the most of any quarter.
        </figcaption>
      ) : null}
      <div className="flex items-end gap-3">
        {totals.map((total, i) => (
          <div
            key={i}
            className="flex flex-1 flex-col items-center justify-end gap-1"
            title={`${periodLabel(i)}: ${game.away.abbr} ${periods.away[i]}, ${game.home.abbr} ${periods.home[i]}`}
          >
            <span className={cn("text-[13px] tabular-nums", i === best ? "font-black" : "font-semibold text-muted-foreground")}>
              {total}
            </span>
            <div
              className="flex w-full shrink-0 flex-col gap-px overflow-hidden rounded-[4px]"
              style={{
                height: Math.max(4, Math.round((total / max) * 84)),
                opacity: focusPeriod == null || i === best ? 1 : 0.35,
              }}
            >
              <div style={{ flex: periods.home[i], background: colors.home }} />
              <div style={{ flex: periods.away[i], background: colors.away }} />
            </div>
            <span className="text-[11px] text-muted-foreground">{periodLabel(i)}</span>
          </div>
        ))}
      </div>
      <p className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colors.home }} />
          {game.home.abbr} on top
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colors.away }} />
          {game.away.abbr} below
        </span>
      </p>
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

function pointsParts(line: RecentInsightStatLine) {
  const parts = [
    { label: "2PT", pts: (line.fgm - line.threePm) * 2, opacity: 1 },
    { label: "3PT", pts: line.threePm * 3, opacity: 0.68 },
    { label: "FT", pts: line.ftm, opacity: 0.4 },
  ];
  return line.points > 0 && sum(parts.map((p) => p.pts)) === line.points ? parts : null;
}

/** True when 2s, 3s and free throws add up to the points total. */
export function pointsAddUp(line: RecentInsightStatLine): boolean {
  return pointsParts(line) != null;
}

/**
 * Where the points came from (2s, 3s, free throws) on one bar, with a tick at
 * the season average when one exists. Null when the splits don't add up.
 */
export function InsightPointsMix({
  line,
  color,
}: {
  line: RecentInsightStatLine;
  color: string;
}) {
  const parts = pointsParts(line);
  if (!parts) return null;
  const ink = color.startsWith("var(") ? "var(--background)" : "#fff";
  const avg = line.seasonPpg != null && line.seasonPpg > 0 ? line.seasonPpg : null;
  const scale = avg != null ? Math.max(line.points, avg) * 1.06 : line.points;
  const diff = avg != null ? line.points - avg : null;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-[13px] font-semibold leading-snug">
        {diff != null && Math.abs(diff) >= 1 ? (
          <>
            <span className={diff > 0 ? "text-delta-up" : "text-delta-down"}>
              {diff > 0 ? "+" : "−"}
              {Math.abs(diff).toFixed(0)}
            </span>{" "}
            vs his season average of {avg!.toFixed(1)}
          </>
        ) : (
          `How the ${line.points} points came`
        )}
      </figcaption>
      <div className="relative pt-5">
        {avg != null ? (
          <div
            aria-hidden
            className="absolute inset-y-0 flex flex-col items-center"
            style={{ left: `${(avg / scale) * 100}%`, transform: "translateX(-50%)" }}
          >
            <span className="text-[10px] font-semibold whitespace-nowrap text-muted-foreground">
              Season {avg.toFixed(1)}
            </span>
            <span className="w-0.5 flex-1 rounded-full bg-foreground/70" />
          </div>
        ) : null}
        <div className="flex h-7 overflow-hidden rounded-[6px] bg-secondary">
          {parts.map((p) =>
            p.pts > 0 ? (
              <div
                key={p.label}
                className="flex items-center justify-center text-[12px] font-bold tabular-nums"
                style={{ width: `${(p.pts / scale) * 100}%`, background: color, opacity: p.opacity, color: ink }}
              >
                {p.opacity > 0.6 && p.pts / scale > 0.1 ? p.pts : ""}
              </div>
            ) : null
          )}
        </div>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ background: color, opacity: p.opacity }} />
            {p.pts} from {p.label === "FT" ? "free throws" : p.label === "3PT" ? "3s" : "2s"}
          </span>
        ))}
      </p>
    </figure>
  );
}

/** Blocks grouped in fives so a count reads without adding up squares. */
function CountBlocks({
  count,
  color,
  opacity = 1,
}: {
  count: number;
  color: string;
  opacity?: number;
}) {
  const shown = Math.min(count, 25);
  const groups = Math.ceil(shown / 5);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {Array.from({ length: groups }, (_, g) => (
        <span key={g} className="flex gap-[3px]">
          {Array.from({ length: Math.min(5, shown - g * 5) }, (_, i) => (
            <span key={i} className="h-5 w-3 rounded-[3px]" style={{ background: color, opacity }} />
          ))}
        </span>
      ))}
      {count > shown ? <span className="text-[12px] text-muted-foreground">+{count - shown}</span> : null}
    </span>
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
  const rows =
    focus === "stocks"
      ? [
          { label: "Steals", count: line.steals, opacity: 1 },
          { label: "Blocks", count: line.blocks, opacity: 0.55 },
        ]
      : [{ label: focus === "rebounds" ? "Rebounds" : "Assists", count: focus === "rebounds" ? line.rebounds : line.assists, opacity: 1 }];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[4.25rem_1fr_auto] items-center gap-2">
          <span className="text-[12px] font-semibold text-muted-foreground">{row.label}</span>
          {row.count > 0 ? (
            <CountBlocks count={row.count} color={color} opacity={row.opacity} />
          ) : (
            <span className="text-[12px] text-muted-foreground">None</span>
          )}
          <span className="text-[15px] font-black tabular-nums">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Activity-style rings for PTS, REB and AST. Each ring closes at 10. */
export function InsightTripleDoubleRings({
  line,
  color,
}: {
  line: RecentInsightStatLine;
  color: string;
}) {
  const stats = [
    { label: "PTS", v: line.points, r: 42, opacity: 1 },
    { label: "REB", v: line.rebounds, r: 31, opacity: 0.72 },
    { label: "AST", v: line.assists, r: 20, opacity: 0.48 },
  ];
  const closed = stats.filter((s) => s.v >= 10).length;
  return (
    <figure className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-[104px] w-[104px] shrink-0 -rotate-90" role="img" aria-label={stats.map((s) => `${s.v} ${s.label}`).join(", ")}>
        {stats.map((s) => {
          const c = 2 * Math.PI * s.r;
          const frac = Math.min(s.v / 10, 1);
          return (
            <g key={s.label}>
              <circle cx={50} cy={50} r={s.r} fill="none" stroke="var(--secondary)" strokeWidth={9} />
              <circle
                cx={50}
                cy={50}
                r={s.r}
                fill="none"
                stroke={color}
                strokeOpacity={s.opacity}
                strokeWidth={9}
                strokeLinecap="round"
                strokeDasharray={`${frac * c} ${c}`}
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[13px] font-semibold leading-snug">
          {closed === 3 ? "All three rings closed" : `${closed} of 3 rings closed`}
        </span>
        {stats.map((s) => (
          <span key={s.label} className="flex items-center gap-2 text-[12px]">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: color, opacity: s.opacity }} />
            <span className="w-8 font-semibold text-muted-foreground">{s.label}</span>
            <span className="font-black tabular-nums">{s.v}</span>
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground">A ring closes at 10</span>
      </figcaption>
    </figure>
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

/**
 * This game against the player's per-game averages. Each row has its own
 * scale, so bar length compares a stat with his own norm, not with other stats.
 */
export function InsightVsNorm({
  line,
  color,
}: {
  line: RecentInsightStatLine;
  color: string;
}) {
  const base = line.baseline;
  if (!base) return null;
  const rows: Array<{ stat: SurpriseStat; label: string; v: number; avg: number }> = [
    { stat: "points", label: "PTS", v: line.points, avg: base.points },
    { stat: "rebounds", label: "REB", v: line.rebounds, avg: base.rebounds },
    { stat: "assists", label: "AST", v: line.assists, avg: base.assists },
    { stat: "threePm", label: "3PM", v: line.threePm, avg: base.threePm },
  ];
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const on = row.stat === line.surpriseStat;
          const scale = Math.max(row.v, row.avg, 1) * 1.08;
          return (
            <div key={row.stat} className="grid grid-cols-[2.25rem_1fr_4.5rem] items-center gap-2">
              <span className={cn("text-[11px] font-semibold", on ? "text-foreground" : "text-muted-foreground")}>
                {row.label}
              </span>
              <span className="relative h-3.5 rounded-[4px] bg-secondary">
                <span
                  className="absolute inset-y-0 left-0 rounded-[4px]"
                  style={{ width: `${(row.v / scale) * 100}%`, background: color, opacity: on ? 1 : 0.3 }}
                />
                <span
                  aria-hidden
                  className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground/75"
                  style={{ left: `${(row.avg / scale) * 100}%` }}
                />
              </span>
              <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                <span className={cn("font-bold", on ? "text-foreground" : "")}>{row.v}</span> vs{" "}
                {row.avg.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="text-[10px] text-muted-foreground">
        Bars are this game. Ticks are his {base.season} per-game averages over {base.games} games.
      </figcaption>
    </figure>
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
    { label: "PTS", v: line.points, on: focus === "points" || focus === "efficiency" || focus === "trend" || focus === "triple_double" || line.surpriseStat === "points" },
    { label: "REB", v: line.rebounds, on: focus === "rebounds" || focus === "triple_double" || line.surpriseStat === "rebounds" },
    { label: "AST", v: line.assists, on: focus === "assists" || focus === "triple_double" || line.surpriseStat === "assists" },
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
  const colors = gameColors(game);
  const side = (s: RecentInsightGame["home"], won: boolean) => (
    <span className={cn("inline-flex items-center gap-1.5", won ? "font-bold text-foreground" : "text-muted-foreground")}>
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s === game.home ? colors.home : colors.away }} />
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

function flowSeconds(periods: number): number {
  return 4 * 720 + Math.max(0, periods - 4) * 300;
}

function flowPeriodStart(period: number): number {
  return period <= 4 ? (period - 1) * 720 : 2880 + (period - 5) * 300;
}

/**
 * Score margin after every scoring play, shaded in the leading team's color,
 * with the moment the card is about marked on it.
 */
export function InsightFlowChart({ game }: { game: RecentInsightGame }) {
  const flow = game.flow;
  if (!flow || flow.path.length < 2) return null;
  const colors = gameColors(game);
  const total = flowSeconds(flow.periods);
  const margins = flow.path.map(([, m]) => m);
  const reach = Math.max(8, ...margins.map((m) => Math.abs(m)));
  const hi = Math.max(...margins, 0) > 0 ? reach : 4;
  const lo = Math.min(...margins, 0) < 0 ? -reach : -4;

  const W = 340;
  const H = 132;
  const padX = 34;
  const padRight = 26;
  const top = 18;
  const bottom = H - 22;
  const x = (t: number) => padX + (Math.min(t, total) / total) * (W - padX - padRight);
  const y = (m: number) => top + ((hi - m) / (hi - lo || 1)) * (bottom - top);
  const mid = y(0);
  let line = `M${x(0).toFixed(1)},${mid.toFixed(1)}`;
  for (const [t, m] of flow.path.slice(1)) line += ` H${x(t).toFixed(1)} V${y(m).toFixed(1)}`;
  line += ` H${x(total).toFixed(1)}`;
  const area = `${line} V${mid.toFixed(1)} H${x(0).toFixed(1)} Z`;
  const clipId = `flow-${game.away.abbr}-${game.home.abbr}-${game.away.score}-${game.home.score}`;
  const final = margins.at(-1) ?? 0;
  const finalColor = final > 0 ? colors.home : final < 0 ? colors.away : "var(--muted-foreground)";
  const mark = flow.mark;
  const markColor = (m: number) => (m > 0 ? colors.home : m < 0 ? colors.away : "var(--foreground)");
  const periods = Array.from({ length: flow.periods }, (_, i) => i + 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[124px] w-full overflow-visible"
      role="img"
      aria-label={`Score margin through the game. Final: ${game.away.abbr} ${game.away.score}, ${game.home.abbr} ${game.home.score}.${mark ? ` Marked: ${mark.label}.` : ""}`}
    >
      <defs>
        <clipPath id={`${clipId}-top`}>
          <rect x={0} y={0} width={W} height={mid} />
        </clipPath>
        <clipPath id={`${clipId}-bottom`}>
          <rect x={0} y={mid} width={W} height={H - mid} />
        </clipPath>
      </defs>
      <text x={0} y={mid - 5} className="text-[11px] font-bold" fill={colors.home}>
        {game.home.abbr}
      </text>
      <text x={0} y={mid + 14} className="text-[11px] font-bold" fill={colors.away}>
        {game.away.abbr}
      </text>
      {mark?.kind === "span" ? (
        <g>
          <rect
            x={x(mark.t0) - 2}
            y={top - 4}
            width={Math.max(4, x(mark.t1) - x(mark.t0) + 4)}
            height={bottom - top + 8}
            rx={3}
            fill="var(--foreground)"
            opacity={0.08}
          />
          <text
            x={Math.min(W - padRight, Math.max(padX, (x(mark.t0) + x(mark.t1)) / 2))}
            y={top - 7}
            textAnchor="middle"
            className="text-[11px] font-bold"
            fill="var(--foreground)"
          >
            {mark.label}
          </text>
        </g>
      ) : null}
      <line x1={padX} x2={W - padRight} y1={mid} y2={mid} stroke="var(--border)" strokeWidth={1} />
      {periods.slice(1).map((p) => (
        <line
          key={p}
          x1={x(flowPeriodStart(p))}
          x2={x(flowPeriodStart(p))}
          y1={top}
          y2={bottom}
          stroke="var(--border)"
          strokeDasharray="2 3"
          strokeWidth={1}
          opacity={0.6}
        />
      ))}
      <path d={area} fill={colors.home} opacity={0.2} clipPath={`url(#${clipId}-top)`} />
      <path d={area} fill={colors.away} opacity={0.2} clipPath={`url(#${clipId}-bottom)`} />
      <path d={line} fill="none" stroke={colors.home} strokeWidth={1.75} strokeLinejoin="round" clipPath={`url(#${clipId}-top)`} />
      <path d={line} fill="none" stroke={colors.away} strokeWidth={1.75} strokeLinejoin="round" clipPath={`url(#${clipId}-bottom)`} />
      {mark?.kind === "goahead" ? (
        <line
          x1={x(mark.t)}
          x2={x(mark.t)}
          y1={top - 2}
          y2={bottom}
          stroke="var(--foreground)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      ) : null}
      {mark && mark.kind !== "span" ? (
        <g>
          <circle cx={x(mark.t)} cy={y(mark.margin)} r={4.5} fill="var(--card)" stroke={markColor(mark.margin)} strokeWidth={2.5} />
          <text
            x={Math.min(W - padRight - 4, Math.max(padX + 4, x(mark.t)))}
            y={mark.margin >= 0 ? y(mark.margin) - 9 : y(mark.margin) + 17}
            textAnchor="middle"
            className="text-[11px] font-bold"
            fill="var(--foreground)"
          >
            {mark.label}
          </text>
        </g>
      ) : null}
      <text x={x(total) + 4} y={y(final) + 4} className="text-[11px] font-bold tabular-nums" fill={finalColor}>
        {final === 0 ? "0" : `+${Math.abs(final)}`}
      </text>
      {periods.map((p) => {
        const start = flowPeriodStart(p);
        const end = p < flow.periods ? flowPeriodStart(p + 1) : total;
        return (
          <text key={p} x={(x(start) + x(end)) / 2} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {periodLabel(p - 1)}
          </text>
        );
      })}
    </svg>
  );
}

/** A player's points in each period, the takeover period in full color. */
export function InsightPeriodBars({
  periodPoints,
  focusPeriod,
  color,
}: {
  periodPoints: number[];
  focusPeriod?: number;
  color: string;
}) {
  const max = Math.max(...periodPoints, 1);
  return (
    <div className="flex h-[92px] items-end gap-3">
      {periodPoints.map((pts, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className={cn("text-[13px] tabular-nums", i === focusPeriod ? "font-black" : "font-semibold text-muted-foreground")}>
            {pts}
          </span>
          <div
            className="w-full rounded-[4px]"
            style={{
              height: `${Math.max(3, (pts / max) * 62)}px`,
              background: color,
              opacity: i === focusPeriod ? 1 : 0.3,
            }}
          />
          <span className="text-[11px] text-muted-foreground">{periodLabel(i)}</span>
        </div>
      ))}
    </div>
  );
}

/** Who made a team's threes, most first. */
export function InsightContributorBars({
  items,
  color,
}: {
  items: { name: string; value: number }[];
  color: string;
}) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.name} className="grid grid-cols-[7.5rem_1fr_1.5rem] items-center gap-2 text-[11px]">
          <span className="truncate font-semibold text-muted-foreground">{item.name}</span>
          <span className="h-2.5 rounded-full bg-secondary">
            <span className="block h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
          </span>
          <span className="text-right font-bold tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
