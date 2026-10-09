import { AheadList, AheadRace, PayoffViewToggle, type AheadLine, type AheadRow } from "@/components/charts/salary-ahead-chart";
import { SalaryPayoffPanel, type PayoffRow } from "@/components/charts/salary-payoff-chart";
import { SalaryPayoffWaiting } from "@/components/charts/salary-payoff-waiting";
import {
  getPayoffSeason,
  payoffPinIds,
  payoffLeftOutNote,
  payoffLine,
  payoffMethodNote,
  payoffSourceNote,
  payoffWaiting,
  sampleIndexes,
  type PayoffSummary,
} from "@/data/runtime/salary-payoff";
import { type } from "@/lib/design-system";
import { shortDate } from "@/lib/salary-payoff";
import { resolveTeamBrand } from "@/lib/nba-brand";
import type { PlayerRaceFieldSize, PlayerRaceRankEnd } from "@/lib/player-race-tracker";
import { cn } from "@/lib/utils";
import { applyVizFieldFilter } from "@/lib/viz-field-filter";
import { parseVizTeamKeys } from "@/lib/viz-team-highlight";

/** Wide fields thin each line's points so the page stays light. */
const WIDE_FIELD = 40;
const WIDE_FIELD_POINTS = 90;

function fieldBlurb(fieldSize: PlayerRaceFieldSize, rankEnd: PlayerRaceRankEnd, total: number): string {
  if (fieldSize === "all" || fieldSize >= total) return `All ${total} players`;
  if (rankEnd === "low") return `The ${fieldSize} lowest of ${total} players`;
  if (rankEnd === "both") {
    const top = Math.ceil(fieldSize / 2);
    return `The ${top} highest and ${fieldSize - top} lowest of ${total} players`;
  }
  return `The ${fieldSize} highest of ${total} players`;
}

export async function PlayerPayoffBoard({
  season,
  fieldSize,
  rankEnd,
  pin,
  team,
}: {
  season: string;
  fieldSize: PlayerRaceFieldSize;
  rankEnd: PlayerRaceRankEnd;
  pin?: string;
  team?: string;
}) {
  const waiting = payoffWaiting(season);
  if (waiting) {
    const q = new URLSearchParams({ view: "payoff", season: waiting.previous ?? "" });
    if (pin) q.set("pin", pin);
    if (team) q.set("team", team);
    return (
      <section className="sports-card flex flex-col gap-2 p-4 sm:p-5" aria-labelledby="player-payoff-title">
        <h2 id="player-payoff-title" className={type.heading}>
          Salary played off · {waiting.season}
        </h2>
        <SalaryPayoffWaiting
          waiting={waiting}
          previousHref={waiting.previous ? `/explore/players/visualizations?${q}` : null}
        />
      </section>
    );
  }
  const found = getPayoffSeason(season);
  if (!found || !found.players.length) {
    return (
      <p className={cn(type.bodySm, "sports-card px-4 py-10 text-center text-muted-foreground")}>
        No salary payoff lines for {season}.
      </p>
    );
  }
  const { meta, players } = found;
  const pinMap = await payoffPinIds(pin, meta.season);
  const pins = new Set(pinMap.values());
  const teamIds = new Set(
    parseVizTeamKeys(team)
      .map((key) => resolveTeamBrand(key)?.espnTeamId)
      .filter((id): id is string => Boolean(id))
  );
  const strong = (p: PayoffSummary) => (p.nbaId ? pins.has(p.nbaId) : false) || teamIds.has(p.teamId);

  const shown = applyVizFieldFilter(players, {
    fieldSize,
    rankEnd,
    keyOf: (p) => p.key,
    sortValue: (p) => p.pct.at(-1) ?? 0,
    isPinned: strong,
  }).sort((a, b) => a.rank - b.rank);
  const unmatchedPins = new Set((pin ?? "").split(",").map((p) => p.trim()).filter(Boolean)).size - pinMap.size;

  const aheadEnd = (p: PayoffSummary) => p.ahead.at(-1) ?? 0;
  const aheadRank = new Map(
    [...players].sort((a, b) => aheadEnd(b) - aheadEnd(a) || a.name.localeCompare(b.name)).map((p, i) => [p.key, i + 1])
  );
  const shownAhead = applyVizFieldFilter(players, {
    fieldSize,
    rankEnd,
    keyOf: (p) => p.key,
    sortValue: aheadEnd,
    isPinned: strong,
  }).sort((a, b) => (aheadRank.get(a.key) ?? 0) - (aheadRank.get(b.key) ?? 0));
  const aheadIndexes = sampleIndexes(meta.dates.length, shownAhead.length > WIDE_FIELD ? WIDE_FIELD_POINTS : meta.dates.length);
  const aheadLines: AheadLine[] = shownAhead.map((p) => ({
    id: p.key,
    name: p.name,
    teamId: p.teamId,
    href: p.nbaId ? `/players/${p.nbaId}` : null,
    salary: p.salary,
    ahead: aheadIndexes.map((i) => Math.round((p.ahead[i] ?? 0) / 1000) * 1000),
    strong: strong(p),
  }));
  const aheadRows: AheadRow[] = shownAhead.map((p) => ({
    id: p.key,
    rank: aheadRank.get(p.key) ?? 0,
    name: p.name,
    teamId: p.teamId,
    href: p.nbaId ? `/players/${p.nbaId}` : null,
    salary: p.salary,
    ahead: aheadEnd(p),
    strong: strong(p),
  }));

  const indexes = sampleIndexes(meta.dates.length, shown.length > WIDE_FIELD ? WIDE_FIELD_POINTS : meta.dates.length);
  const rows: PayoffRow[] = shown.map((p) => ({
    id: p.key,
    rank: p.rank,
    name: p.name,
    teamId: p.teamId,
    href: p.nbaId ? `/players/${p.nbaId}` : null,
    salary: p.salary,
    earned: p.earned.at(-1) ?? 0,
    pct: p.pct.at(-1) ?? 0,
    paidOff: p.paidOff,
    projected: p.projected,
    strong: strong(p),
  }));
  const leftOut = payoffLeftOutNote(meta);

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="player-payoff-title">
      <div>
        <h2 id="player-payoff-title" className={type.heading}>
          Salary played off · {meta.season}
        </h2>
        <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
          {fieldBlurb(fieldSize, rankEnd, players.length)}
          {meta.kind === "nightly" ? `, through ${shortDate(meta.through)}` : ""}. Ahead or behind is what each
          player&apos;s play has been worth so far minus the salary paid out so far. Played off is the share of the
          year&apos;s salary his play has covered.
        </p>
      </div>
      <PayoffViewToggle
        views={[
          {
            id: "ahead",
            label: "Ahead or behind",
            node: (
              <div className="flex flex-col gap-4">
                <AheadRace dates={aheadIndexes.map((i) => meta.dates[i])} lines={aheadLines} height={440} />
                <AheadList rows={aheadRows} label="Players ranked by dollars ahead of their salary" />
              </div>
            ),
          },
          {
            id: "played-off",
            label: "Played off",
            node: (
              <SalaryPayoffPanel
                dates={indexes.map((i) => meta.dates[i])}
                pace={indexes.map((i) => meta.pace[i])}
                lines={shown.map((p) => payoffLine(p, indexes, strong(p)))}
                rows={rows}
                title={`Salary played off · ${meta.season}`}
                listLabel="Players ranked by share of salary covered"
              />
            ),
          },
        ]}
      />
      <div className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
        <p>{payoffMethodNote(meta)}</p>
        <p>{payoffSourceNote(meta)}</p>
        {leftOut || unmatchedPins ? (
          <p>
            {leftOut ? `${leftOut} ` : ""}
            {unmatchedPins
              ? `${unmatchedPins === 1 ? "One pinned player has" : `${unmatchedPins} pinned players have`} no line this season, so ${unmatchedPins === 1 ? "he isn't" : "they aren't"} shown.`
              : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
