"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { Button } from "@/components/ui/button";
import { GmConfirmAction } from "@/gm/ui/gm-confirm-action";
import { remainingSalaryM } from "@/gm/lib/contract-terms";
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABEL,
  letterRank,
  playerSheet,
  ratingToLetter,
  SIMPLE_CATS,
  simpleCategoryMeans,
  type LetterGrade,
} from "@/gm/engine/attributes";
import { traitLabel } from "@/gm/engine/dev-traits";
import { formatHeight, scoutPotentialView } from "@/gm/engine/scouting";
import { perGame, rateLabel, shotLabel } from "@/gm/lib/counting";
import { countingForBoard, seasonHasGames } from "@/gm/lib/season-line";
import { displayPlayerName, userPlayers, userTeam } from "@/gm/lib/selectors";
import {
  archetypeLabel,
  detectArchetype,
} from "@/gm/seed/prospect-identities";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmLeagueState, GmPlayer, GmPosition } from "@/gm/types";
import { UNAVAILABLE_STAT_LABEL, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type RosterView = "simple" | "detailed" | "tendency" | "stats";
type StatsMode = "perGame" | "totals";

const SECONDARY: Record<GmPosition, GmPosition[]> = {
  PG: ["SG"],
  SG: ["PG", "SF"],
  SF: ["SG", "PF"],
  PF: ["SF", "C"],
  C: ["PF"],
};

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const first = parts[0]!;
  return `${first[0]}. ${parts.slice(1).join(" ")}`;
}

function secondaryPos(player: GmPlayer): GmPosition | null {
  if (player.secondaryPosition && player.secondaryPosition !== player.position) {
    return player.secondaryPosition;
  }
  const sheet = playerSheet(player);
  const attrs = sheet.attributes;
  const options = SECONDARY[player.position];
  for (const pos of options) {
    if (pos === "PG" && attrs.ballHandle >= 78 && attrs.passAccuracy >= 74) return pos;
    if (pos === "SG" && attrs.threePoint >= 72 && attrs.midrange >= 70) return pos;
    if (pos === "SF" && attrs.threePoint >= 68 && attrs.perimeterDefense >= 70) return pos;
    if (pos === "PF" && attrs.defReb >= 72 && (attrs.threePoint >= 65 || attrs.interiorDefense >= 72))
      return pos;
    if (pos === "C" && attrs.interiorDefense >= 74 && attrs.defReb >= 74) return pos;
  }
  return options[0] ?? null;
}

function wingspanIn(player: GmPlayer): number {
  const scouted = player.scoutProfile?.combine?.wingspanIn;
  if (scouted && scouted > 0) return scouted;
  const big = player.position === "C" || player.position === "PF";
  return player.heightIn + (big ? 4 : 2);
}

function moraleLabel(morale: number): string {
  if (morale >= 80) return "Thrilled";
  if (morale >= 65) return "Hopeful";
  if (morale >= 50) return "Steady";
  if (morale >= 35) return "Uneasy";
  return "Frustrated";
}

function fatigueLabel(player: GmPlayer): string {
  if (player.injury && player.injury.gamesRemaining > 0) {
    return player.injury.type;
  }
  const stamina = playerSheet(player).attributes.stamina;
  if (stamina >= 80) return "Fresh";
  if (stamina >= 60) return "Ready";
  if (stamina >= 45) return "Winded";
  return "Gassed";
}

function topStrengths(means: number[]): string[] {
  return means
    .map((value, index) => ({ value, cat: SIMPLE_CATS[index]! }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((row) => row.cat.title);
}

function Delta({
  current,
  prior,
  asGrade = false,
}: {
  current: number;
  prior: number | undefined;
  asGrade?: boolean;
}) {
  if (prior == null || !Number.isFinite(prior)) return null;
  if (asGrade) {
    const now = ratingToLetter(current);
    const then = ratingToLetter(prior);
    if (now === then) return null;
    const up = letterRank(now) > letterRank(then);
    return (
      <span className={cn("gm-roster__delta", up ? "is-up" : "is-down")}>
        {up ? "▲" : "▼"} {then}
      </span>
    );
  }
  const gap = Math.round(current - prior);
  if (gap === 0) return null;
  return (
    <span className={cn("gm-roster__delta", gap > 0 ? "is-up" : "is-down")}>
      {gap > 0 ? "▲" : "▼"} {gap > 0 ? gap : gap}
    </span>
  );
}

function GradeCell({
  value,
  prior,
}: {
  value: number;
  prior?: number;
}) {
  const grade: LetterGrade = ratingToLetter(value);
  return (
    <td className="gm-roster__grade" title={`${Math.round(value)}`}>
      <span>{grade}</span>
      <Delta current={value} prior={prior} asGrade />
    </td>
  );
}

export function GmRosterBoard({ league }: { league: GmLeagueState }) {
  const waivePlayer = useGmStore((s) => s.waivePlayer);
  const team = userTeam(league);
  const scout = team.staff.scout;
  const players = useMemo(
    () =>
      [...userPlayers(league)].sort((a, b) => {
        const gap = playerSheet(b).overall - playerSheet(a).overall;
        if (gap !== 0) return gap;
        return displayPlayerName(a).localeCompare(displayPlayerName(b));
      }),
    [league]
  );

  const [selectedId, setSelectedId] = useState<string | null>(players[0]?.id ?? null);
  const [view, setView] = useState<RosterView>("simple");
  const [statsMode, setStatsMode] = useState<StatsMode>("perGame");

  useEffect(() => {
    if (!players.some((player) => player.id === selectedId)) {
      setSelectedId(players[0]?.id ?? null);
    }
  }, [players, selectedId]);

  const selected = players.find((player) => player.id === selectedId) ?? players[0] ?? null;
  const simStarted = seasonHasGames(league);

  return (
    <div className="gm-roster flex flex-col gap-3">
      {selected ? (
        <SelectedHero
          player={selected}
          league={league}
          scout={scout}
          onWaive={() => waivePlayer(selected.id)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No players on the roster.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="gm-roster__tabs" role="tablist" aria-label="Roster views">
          {(
            [
              ["simple", "Simple"],
              ["detailed", "Detailed"],
              ["tendency", "Tendency"],
              ["stats", "Stats"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={cn("gm-roster__tab", view === id && "is-active")}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "stats" ? (
          <div
            className="gm-roster__tabs"
            role="tablist"
            aria-label="Stat display"
          >
            {(
              [
                ["perGame", "Per game"],
                ["totals", "Totals"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={statsMode === id}
                className={cn("gm-roster__tab", statsMode === id && "is-active")}
                onClick={() => setStatsMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="gm-club-panel gm-roster__panel overflow-x-auto">
        {view === "simple" ? (
          <SimpleTable
            players={players}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            scout={scout}
          />
        ) : null}
        {view === "detailed" ? (
          <DetailedTable
            players={players}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        ) : null}
        {view === "tendency" ? (
          <TendencyTable
            players={players}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        ) : null}
        {view === "stats" ? (
          <StatsTable
            league={league}
            players={players}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            mode={statsMode}
          />
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        {view === "stats"
          ? simStarted
            ? "Counting from games in this save. Switch Per game / Totals above."
            : "Entry-season lines until tip-off. Switch Per game / Totals above."
          : "Select a row for the header card. Simple uses letter grades A+ through F. Arrows mark the last progression tick."}
      </p>
    </div>
  );
}

function SelectedHero({
  player,
  league,
  scout,
  onWaive,
}: {
  player: GmPlayer;
  league: GmLeagueState;
  scout: ReturnType<typeof userTeam>["staff"]["scout"];
  onWaive: () => void;
}) {
  const sheet = playerSheet(player);
  const means = simpleCategoryMeans(sheet.attributes);
  const strengths = topStrengths(means);
  const second = secondaryPos(player);
  const archetype = archetypeLabel(detectArchetype(player.ratings, player.position));
  const scoutRead = scoutPotentialView(player, scout);
  const totalYears = player.contract?.yearsRemaining ?? 0;
  const totalMoney = remainingSalaryM(player.contract);
  const ovrDelta =
    sheet.priorOverall != null ? Math.round(sheet.overall - sheet.priorOverall) : null;

  return (
    <section className="gm-roster__hero">
      <div className="gm-roster__hero-media">
        <TeamLogo teamKey={league.userTeamId} size="md" />
        <PlayerHeadshot
          playerId={player.nbaPlayerId ?? player.id}
          name={displayPlayerName(player)}
          teamKey={player.teamId}
          size="xl"
        />
      </div>

      <div className="gm-roster__rating">
        <div className="gm-roster__ovr" aria-label={`${sheet.overall} overall`}>
          <svg className="gm-roster__ovr-ring" viewBox="0 0 100 100" aria-hidden="true">
            <circle className="gm-roster__ovr-track" cx="50" cy="50" r="45" pathLength="100" />
            <circle
              className="gm-roster__ovr-fill"
              cx="50"
              cy="50"
              r="45"
              pathLength="100"
              strokeDasharray={`${Math.max(0, Math.min(100, sheet.overall))} 100`}
            />
          </svg>
          <div className="gm-roster__ovr-core">
            <span className="gm-roster__ovr-num">{sheet.overall}</span>
            <span className="gm-roster__ovr-label">OVR</span>
          </div>
          {ovrDelta != null && ovrDelta !== 0 ? (
            <span
              className={cn("gm-roster__delta", ovrDelta > 0 ? "is-up" : "is-down")}
              aria-label={`${ovrDelta > 0 ? "up" : "down"} ${Math.abs(ovrDelta)}`}
            >
              {ovrDelta > 0 ? "+" : "−"}
              {Math.abs(ovrDelta)}
            </span>
          ) : null}
        </div>
        {sheet.potential.trait ? (
          <span
            className="gm-roster__trait"
            data-trait={sheet.potential.trait}
          >
            {traitLabel(sheet.potential.trait)}
          </span>
        ) : null}
      </div>

      <div className="gm-roster__hero-main">
        <div className="gm-roster__name-row">
          <Link
            href={`/gm/player/${encodeURIComponent(player.id)}`}
            className="gm-roster__name"
          >
            {displayPlayerName(player)}
          </Link>
          {player.jersey ? <span className="gm-roster__jersey">#{player.jersey}</span> : null}
        </div>
        <p className="gm-roster__meta">
          <span>{player.position}</span>
          {second ? <span>{second}</span> : null}
          <span>{formatHeight(player.heightIn)}</span>
          <span>{player.weightLbs} lbs</span>
          <span>{formatHeight(wingspanIn(player))} span</span>
          <span>Age {player.age}</span>
        </p>
        <p className="gm-roster__archetype">{archetype}</p>
        <p className="gm-roster__strengths">{strengths.join(" · ")}</p>
        <p className="gm-roster__scout text-sm text-muted-foreground" title={scoutRead.comment}>
          Scout POT {scoutRead.low}-{scoutRead.high}
          <span className="ml-1 text-[11px]">(scout range, not true ceiling)</span>
        </p>
        {sheet.potential.trait && sheet.potential.trait !== "normal" ? (
          <p className="gm-roster__growth text-xs text-muted-foreground" title={scoutRead.comment}>
            {scoutRead.comment}
          </p>
        ) : null}
      </div>

      <div className="gm-roster__hero-status">
        <Status label="Fatigue" value={fatigueLabel(player)} />
        <Status label="Relations" value={moraleLabel(player.morale)} />
        <Status
          label="Contract"
          value={
            player.contract
              ? `${totalYears} YRS · $${formatNumber(totalMoney ?? 0, 1)}M`
              : "Free agent"
          }
        />
        <GmConfirmAction label="Waive" title={"Waive " + player.name + "?"} confirmLabel="Waive player" onConfirm={onWaive} disabled={Boolean(player.pendingRookieContract)}><p>He will leave your roster and become available to other teams.</p><p>${formatNumber(totalMoney, 2)}M remains on your salary sheet over {totalYears} season(s). Waiving him frees a roster spot, not that salary.</p></GmConfirmAction>
      </div>
    </section>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="gm-roster__status">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SimpleTable({
  players,
  selectedId,
  onSelect,
  scout,
}: {
  players: GmPlayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  scout: ReturnType<typeof userTeam>["staff"]["scout"];
}) {
  return (
    <table className="gm-roster__table w-full min-w-[920px] text-left text-sm">
      <thead>
        <tr>
          <th>Name</th>
          <th>Pos</th>
          <th>Age</th>
          <th>Rating</th>
          {SIMPLE_CATS.map((cat) => (
            <th key={cat.id} title={cat.title}>
              {cat.label}
            </th>
          ))}
          <th title="Scouted potential">POT</th>
        </tr>
      </thead>
      <tbody>
        {players.map((player) => {
          const sheet = playerSheet(player);
          const means = simpleCategoryMeans(sheet.attributes);
          const prior = sheet.priorSimple;
          const pot = scoutPotentialView(player, scout);
          const potGrade = ratingToLetter((pot.low + pot.high) / 2);
          return (
            <tr
              key={player.id}
              className={cn(selectedId === player.id && "is-selected")}
              onClick={() => onSelect(player.id)}
            >
              <td>
                <button type="button" className="gm-roster__name-btn" onClick={() => onSelect(player.id)}>
                  {shortName(displayPlayerName(player))}
                </button>
              </td>
              <td>{player.position}</td>
              <td className="tabular-nums">{player.age}</td>
              <td className="gm-roster__rating tabular-nums">
                <span>{sheet.overall}</span>
                <Delta current={sheet.overall} prior={sheet.priorOverall} />
              </td>
              {means.map((value, index) => (
                <GradeCell key={SIMPLE_CATS[index]!.id} value={value} prior={prior?.[index]} />
              ))}
              <td className="gm-roster__grade" title={`${pot.low}-${pot.high}`}>
                {potGrade}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DetailedTable({
  players,
  selectedId,
  onSelect,
}: {
  players: GmPlayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const keys = ATTRIBUTE_GROUPS.flatMap((group) => group.keys);
  return (
    <table className="gm-roster__table w-full min-w-[1100px] text-left text-sm">
      <thead>
        <tr>
          <th>Name</th>
          <th>Pos</th>
          <th>OVR</th>
          {keys.map((key) => (
            <th key={key}>{ATTRIBUTE_LABEL[key]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {players.map((player) => {
          const sheet = playerSheet(player);
          return (
            <tr
              key={player.id}
              className={cn(selectedId === player.id && "is-selected")}
              onClick={() => onSelect(player.id)}
            >
              <td>
                <button type="button" className="gm-roster__name-btn" onClick={() => onSelect(player.id)}>
                  {shortName(displayPlayerName(player))}
                </button>
              </td>
              <td>{player.position}</td>
              <td className="tabular-nums">{sheet.overall}</td>
              {keys.map((key) => (
                <td key={key} className="tabular-nums">
                  {sheet.attributes[key]}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TendencyTable({
  players,
  selectedId,
  onSelect,
}: {
  players: GmPlayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const cols = [
    ["Close", "shootClose"],
    ["Mid", "shootMid"],
    ["Three", "shootThree"],
    ["Drive", "drive"],
    ["Post", "postUp"],
    ["Pass", "dish"],
    ["Steal", "steal"],
    ["Block", "block"],
  ] as const;

  return (
    <table className="gm-roster__table w-full min-w-[720px] text-left text-sm">
      <thead>
        <tr>
          <th>Name</th>
          <th>Pos</th>
          {cols.map(([label]) => (
            <th key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {players.map((player) => {
          const sheet = playerSheet(player);
          return (
            <tr
              key={player.id}
              className={cn(selectedId === player.id && "is-selected")}
              onClick={() => onSelect(player.id)}
            >
              <td>
                <button type="button" className="gm-roster__name-btn" onClick={() => onSelect(player.id)}>
                  {shortName(displayPlayerName(player))}
                </button>
              </td>
              <td>{player.position}</td>
              {cols.map(([label, key]) => (
                <td key={label} className="tabular-nums">
                  {sheet.tendencies[key]}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function countCell(
  total: number,
  gp: number,
  mode: StatsMode,
  digits = 1
): string {
  if (mode === "totals") {
    if (!Number.isFinite(total) || gp < 1) return UNAVAILABLE_STAT_LABEL;
    return formatNumber(total, total >= 100 ? 0 : digits);
  }
  return rateLabel(total, gp, digits);
}

function StatsTable({
  league,
  players,
  selectedId,
  onSelect,
  mode,
}: {
  league: GmLeagueState;
  players: GmPlayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  mode: StatsMode;
}) {
  const ranked = [...players].sort((a, b) => {
    const la = countingForBoard(league, a);
    const lb = countingForBoard(league, b);
    const pa = la ? (perGame(la.pts, la.gp) ?? -1) : -1;
    const pb = lb ? (perGame(lb.pts, lb.gp) ?? -1) : -1;
    return pb - pa;
  });

  return (
    <table className="gm-roster__table w-full min-w-[960px] text-left text-sm">
      <thead>
        <tr>
          <th>Name</th>
          <th>Pos</th>
          <th>GP</th>
          <th>MIN</th>
          <th>PTS</th>
          <th>REB</th>
          <th>AST</th>
          <th>STL</th>
          <th>BLK</th>
          <th>TOV</th>
          <th>FG%</th>
          <th>3P%</th>
          <th>FT%</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((player) => {
          const line = countingForBoard(league, player);
          const gp = line?.gp ?? 0;
          return (
            <tr
              key={player.id}
              className={cn(selectedId === player.id && "is-selected")}
              onClick={() => onSelect(player.id)}
            >
              <td>
                <button
                  type="button"
                  className="gm-roster__name-btn"
                  onClick={() => onSelect(player.id)}
                >
                  {shortName(displayPlayerName(player))}
                </button>
              </td>
              <td>{player.position}</td>
              <td className="tabular-nums">
                {line ? String(line.gp) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? countCell(line.min, gp, mode) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? countCell(line.pts, gp, mode) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? countCell(line.reb, gp, mode) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? countCell(line.ast, gp, mode) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? countCell(line.stl, gp, mode) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? countCell(line.blk, gp, mode) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? countCell(line.tov, gp, mode) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? shotLabel(line.fgm, line.fga) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? shotLabel(line.tpm, line.tpa) : UNAVAILABLE_STAT_LABEL}
              </td>
              <td className="tabular-nums">
                {line ? shotLabel(line.ftm, line.fta) : UNAVAILABLE_STAT_LABEL}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

