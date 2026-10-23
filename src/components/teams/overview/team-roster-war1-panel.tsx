"use client";

import { useState, type CSSProperties } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TransitionLink } from "@/components/continuity/query-nav";
import { MetricHelp } from "@/components/learn/metric-help";
import { P1_POINTS_PER_WIN, WAR1_LEARN_HREF } from "@/lib/drbl-public-labels";
import { SectionLink } from "@/components/ui/section-link";
import { type } from "@/lib/design-system";
import { cssPct, formatNumber, formatOrdinal } from "@/lib/format";
import { useChartTheme } from "@/lib/chart-theme";
import {
  ROSTER_WINS_LINE_TEAMS,
  ROSTER_WINS_PER_82_INTERCEPT,
  ROSTER_WINS_PER_82_SLOPE,
  displayedRosterWar1,
  rosterWinsLineSeasonsLabel,
  type RosterWarPlayer,
  type RosterWarSquad,
} from "@/lib/team-roster-war1";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";
const WIN = "var(--data-positive)";
const LOSS = "var(--data-negative)";
const WIN_TEXT = "var(--accent-positive)";
const LOSS_TEXT = "var(--accent-negative)";
const WIN_SOFT = "var(--accent-positive-soft)";
const LOSS_SOFT = "var(--accent-negative-soft)";

function signed(value: number, digits: number): string {
  const text = formatNumber(value, digits);
  return value > 0 ? `+${text}` : text;
}

function warText(value: number): string {
  const digits = Math.abs(value) > 0 && Math.abs(value) < 0.005 ? 3 : 2;
  return signed(value, digits);
}

export function TeamRosterWar1Panel({
  squads,
  focusAbbr,
  season,
  gamesPlayed,
  record,
  membership = "published",
  valueSeason,
}: {
  squads: RosterWarSquad[];
  focusAbbr: string;
  season: string;
  gamesPlayed: number | null;
  record: { wins: number; losses: number } | null;
  /** `current` repeats each player's published WAR1 from `valueSeason` for the roster as it stands. */
  membership?: "published" | "current";
  valueSeason?: string;
}) {
  const chartTheme = useChartTheme();
  const pageSquad = squads.find((s) => s.abbreviation === focusAbbr) ?? squads[0];
  const [hoverAbbr, setHoverAbbr] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  if (!pageSquad) return null;
  const squad = pageSquad;
  const ratedSeason = valueSeason ?? season;
  const currentRoster = membership === "current";
  const player =
    squad.players.find((p) => p.nbaId === playerId) ?? squad.players[0] ?? null;
  const shownWar = displayedRosterWar1(squad.war1);
  const partial =
    gamesPlayed != null && gamesPlayed > 0 && gamesPlayed < 70;
  const finished =
    record != null &&
    record.wins + record.losses >= 70 &&
    squad.abbreviation === pageSquad.abbreviation;
  const maxAbs = Math.max(0.5, ...squad.players.map((p) => Math.abs(p.war1)));
  const ladderFocus =
    squads.find((s) => s.abbreviation === (hoverAbbr ?? squad.abbreviation)) ?? squad;

  const ladder =
    squads.length > 1 ? (
      <section className="sports-card flex flex-col gap-2 p-4 sm:p-5" aria-label="League roster sums">
        <LeagueLadder
          squads={squads}
          pageAbbr={pageSquad.abbreviation}
          focus={ladderFocus}
          accent={chartTheme.teamColor(pageSquad.abbreviation).color}
          season={season}
          label="League roster sums"
          onHover={setHoverAbbr}
        />
        <p className={cn(type.bodySm, "tabular-nums")}>
          <span className="font-bold">{ladderFocus.abbreviation}</span>{" "}
          <span className="text-muted-foreground">
            {formatOrdinal(ladderFocus.rank)} of {squads.length} ·{" "}
            {formatNumber(displayedRosterWar1(ladderFocus.war1), 2)} WAR1 ·{" "}
            {formatNumber(ladderFocus.lineWins, 1)} wins per 82
          </span>
        </p>
      </section>
    ) : null;

  return (
    <>
      {ladder}
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-5" aria-label="Roster WAR1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className={type.heading}>
            Roster <MetricHelp conceptId="r1_win_eq">WAR1</MetricHelp>
          </h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            {currentRoster ? (
              <>
                {squad.players.length} have a {ratedSeason} WAR1.
                {squad.withoutWar1
                  ? ` ${squad.withoutWar1} ${squad.withoutWar1 === 1 ? "has" : "have"} none.`
                  : ""}{" "}
                Players who left are not included.
              </>
            ) : (
              <>
                {squad.players.length} players assigned to the {squad.fullName} in {season}.
              </>
            )}
          </p>
        </div>
        <SectionLink href={WAR1_LEARN_HREF}>How WAR1 is defined</SectionLink>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="px-1 py-1">
          <p className={cn(type.caption, "font-semibold uppercase text-muted-foreground")}>Roster WAR1</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(shownWar, 2)}</p>
          <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
            {formatOrdinal(squad.rank)} of {squads.length}
            {squad.r1Points != null ? ` · ${formatNumber(squad.r1Points, 0)} R1 Points` : ""}
          </p>
        </div>
        <div className="px-1 py-1">
          <p className={cn(type.caption, "font-semibold uppercase text-muted-foreground")}>Above and below</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            <span style={{ color: WIN_TEXT }}>{signed(squad.above, 2)}</span>
            <span className="text-muted-foreground"> / </span>
            <span style={{ color: LOSS_TEXT }}>{signed(squad.below, 2)}</span>
          </p>
          <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
            {squad.players.filter((p) => p.war1 > 0).length} above,{" "}
            {squad.players.filter((p) => p.war1 < 0).length} below
            {squad.players.some((p) => p.war1 === 0)
              ? `, ${squad.players.filter((p) => p.war1 === 0).length} at 0`
              : ""}
          </p>
        </div>
        <div className="px-1 py-1">
          <p className={cn(type.caption, "font-semibold uppercase text-muted-foreground")}>Wins per 82</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(squad.lineWins, 1)}</p>
          <p className={cn(type.caption, "mt-1 text-muted-foreground tabular-nums")}>
            {formatNumber(ROSTER_WINS_PER_82_INTERCEPT, 1)} + {formatNumber(ROSTER_WINS_PER_82_SLOPE, 2)} ×{" "}
            {formatNumber(shownWar, 2)}
          </p>
        </div>
      </div>

      <p className={cn(type.bodySm, "text-muted-foreground")}>
        {`Wins per 82 = ${formatNumber(ROSTER_WINS_PER_82_INTERCEPT, 1)} + ${formatNumber(ROSTER_WINS_PER_82_SLOPE, 2)} × roster WAR1, from ${ROSTER_WINS_LINE_TEAMS} team seasons, ${rosterWinsLineSeasonsLabel()}.`}
        {finished && record ? ` The ${pageSquad.fullName} won ${record.wins} games.` : ""}
        {currentRoster && ratedSeason !== season ? ` Uses ${ratedSeason} WAR1 for this roster.` : ""}
        {partial
          ? ` These ${season} ratings cover ${gamesPlayed} team games, and ${formatNumber(squad.lineWins, 1)} reads this sum on the full-season line.`
          : ""}
      </p>

      <PlayerBars
        players={squad.players}
        selectedId={player?.nbaId ?? null}
        maxAbs={maxAbs}
        teamKey={squad.abbreviation}
        onSelect={setPlayerId}
      />

      {player ? <PlayerDetail player={player} season={ratedSeason} /> : null}

      <p className={cn(type.micro, "text-muted-foreground")}>
        Zero is an average player. One WAR1 is {formatNumber(P1_POINTS_PER_WIN, 2)} R1 Points.{" "}
        {currentRoster
          ? `A roster player with no ${ratedSeason} WAR1 is left out of the sum.`
          : "A player who changed teams is counted on one team for the whole season. Players without a published WAR1 are left out of the sum."}
      </p>
    </section>
    </>
  );
}

function PlayerBars({
  players,
  selectedId,
  maxAbs,
  teamKey,
  onSelect,
}: {
  players: RosterWarPlayer[];
  selectedId: string | null;
  maxAbs: number;
  teamKey: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul data-hover-group className="flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto">
      {players.map((player, index) => {
        const width = (Math.abs(player.war1) / maxAbs) * 50;
        const selected = player.nbaId === selectedId;
        return (
          <li key={player.nbaId}>
            <button
              type="button"
              data-hover-item
              data-tip={player.name}
              data-tip-sub={`${warText(player.war1)} WAR1${player.drbl100 != null ? ` · ${signed(player.drbl100, 1)} DRBL/100` : ""}`}
              aria-pressed={selected}
              onClick={() => onSelect(player.nbaId)}
              className={cn(
                "grid w-full grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-2 rounded-md px-1.5 py-1 text-left",
                selected ? "bg-muted/70" : "hover:bg-muted/40"
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <PlayerHeadshot
                  playerId={player.espnId ?? player.nbaId}
                  espnId={player.espnId}
                  nbaId={player.nbaId}
                  name={player.name}
                  teamKey={teamKey}
                  size="xs"
                />
                <span className={cn(type.bodySm, "truncate font-semibold")}>{player.name}</span>
              </span>
              <span className="relative h-6 rounded-md bg-foreground/[0.04]">
                <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/25" aria-hidden />
                <span
                  data-motion-bar="x"
                  data-tip-anchor
                  className="absolute inset-y-1 rounded-[4px]"
                  style={{
                    ...({ "--i": Math.min(index, 12) } as CSSProperties),
                    transformOrigin: player.war1 >= 0 ? "left" : "right",
                    background: player.war1 >= 0 ? WIN : LOSS,
                    width: cssPct(Math.max(player.war1 === 0 ? 0 : 0.8, width), {
                      unit: "percent",
                    }),
                    left: player.war1 >= 0 ? "50%" : undefined,
                    right: player.war1 < 0 ? "50%" : undefined,
                  }}
                />
              </span>
              <span
                className={cn(type.caption, "text-right font-bold tabular-nums")}
                style={{ color: player.war1 >= 0 ? WIN_TEXT : LOSS_TEXT }}
              >
                {warText(player.war1)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PlayerDetail({
  player,
  season,
}: {
  player: RosterWarPlayer;
  season: string;
}) {
  const href = player.espnId
    ? `/players/${encodeURIComponent(player.espnId)}?season=${encodeURIComponent(season)}`
    : null;
  return (
    <p className={cn(type.bodySm)}>
      <span className="font-semibold">{player.name}</span>
      <span className="text-muted-foreground">
        {" "}
        {`${player.drbl100 != null ? `${signed(player.drbl100, 1)} DRBL/100` : "DRBL/100 —"}${player.r1Points != null ? `, ${formatNumber(player.r1Points, 0)} R1 Points` : ""}, ${warText(player.war1)} WAR1`}
      </span>
      {href ? (
        <>
          {" "}
          <SectionLink href={href}>Player page</SectionLink>
        </>
      ) : null}
    </p>
  );
}

function LeagueLadder({
  squads,
  pageAbbr,
  focus,
  accent,
  season,
  label,
  onHover,
}: {
  squads: RosterWarSquad[];
  pageAbbr: string;
  focus: RosterWarSquad;
  accent: string;
  season: string;
  label: string;
  onHover: (abbr: string | null) => void;
}) {
  const max = Math.max(1, ...squads.map((s) => Math.abs(s.war1)));
  return (
    <div className="flex flex-col gap-2">
      <p className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>
        {label}
      </p>
      <div
        data-hover-group
        className="flex h-36 items-stretch gap-[3px]"
        onPointerLeave={() => onHover(null)}
      >
        {squads.map((squad, index) => {
          const own = squad.abbreviation === pageAbbr;
          const hovered = squad.abbreviation === focus.abbreviation && !own;
          const h = (Math.abs(squad.war1) / max) * 50;
          const href =
            !own && squad.espnTeamId
              ? teamPageHref(squad.espnTeamId, { season })
              : null;
          const bar = (
            <>
              <span className="relative block flex-1">
                <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/25" aria-hidden />
                <span
                  data-motion-bar="y"
                  data-tip-anchor
                  className="absolute inset-x-[12%] rounded-[3px]"
                  style={{
                    transformOrigin: squad.war1 >= 0 ? "bottom" : "top",
                    background: own ? accent : squad.war1 >= 0 ? WIN_SOFT : LOSS_SOFT,
                    height: cssPct(Math.max(1.5, h), { unit: "percent" }),
                    ...(squad.war1 >= 0 ? { bottom: "50%" } : { top: "50%" }),
                    boxShadow: own ? `0 0 0 2px var(--background), 0 0 0 3.5px ${accent}` : undefined,
                  }}
                />
              </span>
              <span
                className={cn(
                  "mt-1 self-center whitespace-nowrap text-center text-[9px] tabular-nums sm:text-[10px]",
                  own || hovered ? "font-bold text-foreground" : "text-muted-foreground"
                )}
              >
                {own || hovered ? squad.abbreviation : ""}
              </span>
            </>
          );
          const shared = {
            className: "relative flex min-w-0 flex-1 flex-col",
            "data-hover-item": true,
            "data-tip": squad.abbreviation,
            "data-tip-sub": `${formatNumber(displayedRosterWar1(squad.war1), 2)} WAR1 · ${formatNumber(squad.lineWins, 1)} wins per 82`,
            style: { "--i": Math.round((index / Math.max(1, squads.length - 1)) * 16) } as CSSProperties,
            onPointerEnter: () => onHover(squad.abbreviation),
            onFocus: () => onHover(squad.abbreviation),
          };
          return href ? (
            <TransitionLink
              key={squad.nbaTeamId}
              href={href}
              aria-label={`${squad.fullName}, ${formatNumber(displayedRosterWar1(squad.war1), 2)} WAR1`}
              {...shared}
            >
              {bar}
            </TransitionLink>
          ) : (
            <button
              key={squad.nbaTeamId}
              type="button"
              aria-label={`${squad.fullName}, ${formatNumber(displayedRosterWar1(squad.war1), 2)} WAR1`}
              aria-pressed={own}
              {...shared}
            >
              {bar}
            </button>
          );
        })}
      </div>
    </div>
  );
}
