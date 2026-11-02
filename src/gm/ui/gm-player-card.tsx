"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SectionFrame } from "@/components/layout/section-frame";
import { GmBadgeSummary } from "@/gm/ui/gm-badges";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABEL,
  playerSheet,
} from "@/gm/engine/attributes";
import { playerDevTrait, traitLabel } from "@/gm/engine/dev-traits";
import { scoutPotentialView, trajectoryRead } from "@/gm/engine/scouting";
import {
  entrySeasonIsCurrentSaveYear,
  overlaySimCareerSeasons,
  type GmCareerSeasonRow,
} from "@/gm/lib/career-overlay";
import { rateLabel, shotLabel, simCountingLine } from "@/gm/lib/counting";
import { valueForBoard } from "@/gm/lib/season-line";
import { displayPlayerName, userTeam } from "@/gm/lib/selectors";
import { ClubMark } from "@/gm/ui/club-mark";
import { teamColorStyle } from "@/gm/ui/team-colors";
import type { GmCountingLine, GmLeagueState, GmPlayer } from "@/gm/types";
import { NBA_TEAM_META } from "@/data/providers/nba/nba-team-meta";
import { DRBL_PUBLIC_RATE_LABEL, WAR1_LABEL, formatWar1 } from "@/lib/drbl-public-labels";
import { UNAVAILABLE_STAT_LABEL, formatNumber } from "@/lib/format";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

const CLUB_BY_NAME = new Map(
  Object.values(NBA_TEAM_META).flatMap((team) => [
    [team.fullName.toLowerCase(), team.abbreviation],
    [`${team.city} ${team.nickname}`.toLowerCase(), team.abbreviation],
  ]),
);

/** Career rows sometimes carry only "Los Angeles Lakers". */
function clubKey(abbreviation?: string, name?: string): string | undefined {
  const abbr = abbreviation?.trim();
  if (abbr && resolveTeamBrand(abbr)) return abbr;
  const named = name?.trim().toLowerCase();
  if (!named) return undefined;
  return CLUB_BY_NAME.get(named);
}

type CareerRow = GmCareerSeasonRow;

type AwardChip = { label: string; count: number; seasons: string[] };

function shownRate(total: number | undefined, gp: number): string {
  if (total == null || !Number.isFinite(total)) return UNAVAILABLE_STAT_LABEL;
  return rateLabel(total, gp);
}

function shownShot(made: number | undefined, attempted: number | undefined): string {
  if (made == null || attempted == null) return UNAVAILABLE_STAT_LABEL;
  return shotLabel(made, attempted);
}

function shownNum(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return UNAVAILABLE_STAT_LABEL;
  return formatNumber(value, 1);
}

function shownPct(value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return UNAVAILABLE_STAT_LABEL;
  return shotLabel(value, 1);
}

function feet(inches: number): string {
  if (!Number.isFinite(inches) || inches <= 0) return UNAVAILABLE_STAT_LABEL;
  const feetPart = Math.floor(inches / 12);
  const inchPart = Math.round(inches % 12);
  return `${feetPart}'${inchPart}"`;
}

function LineTable({ line }: { line: GmCountingLine }) {
  const cells: Array<[string, string]> = [
    ["GP", String(line.gp)],
    ["MIN", rateLabel(line.min, line.gp)],
    ["PTS", rateLabel(line.pts, line.gp)],
    ["REB", rateLabel(line.reb, line.gp)],
    ["AST", rateLabel(line.ast, line.gp)],
    ["STL", rateLabel(line.stl, line.gp)],
    ["BLK", rateLabel(line.blk, line.gp)],
    ["TOV", rateLabel(line.tov, line.gp)],
    ["FG%", shotLabel(line.fgm, line.fga)],
    ["3P%", shotLabel(line.tpm, line.tpa)],
    ["FT%", shotLabel(line.ftm, line.fta)],
  ];
  return (
    <div className="gm-statline">
      {cells.map(([label, value]) => (
        <div key={label}>
          <p>{label}</p>
          <p>{value}</p>
        </div>
      ))}
    </div>
  );
}

export function GmPlayerCard({
  league,
  player,
}: {
  league: GmLeagueState;
  player: GmPlayer;
}) {
  const team = league.teams.find((entry) => entry.id === player.teamId);
  const sim = simCountingLine(league, player.id);
  const value = valueForBoard(league, player);
  const sheet = playerSheet(player);
  const scout = userTeam(league).staff.scout;
  const scoutRead = scoutPotentialView(player, scout);
  const inDraft = league.draftPool.includes(player.id);
  const mine = userTeam(league);
  const onRoster = player.teamId === mine.id;
  const shownName = displayPlayerName(player);
  const trait = inDraft || player.draftModel===2 ? null : playerDevTrait(player);
  const profile = player.scoutProfile;
  const [careerApi, setCareerApi] = useState<CareerRow[] | null>(null);
  const [careerNote, setCareerNote] = useState<string | null>(null);
  const [awards, setAwards] = useState<AwardChip[]>([]);
  const games = league.boxScores.filter((box) =>
    box.players.some((line) => line.playerId === player.id)
  );
  const showEntrySeason =
    Boolean(player.nbaSeason) &&
    !entrySeasonIsCurrentSaveYear(player.nbaSeason, league.season);

  const career = useMemo(() => {
    if (!player.nbaPlayerId) {
      // Generated players: still show sim / prior lines as their career.
      return overlaySimCareerSeasons([], league, player);
    }
    if (careerApi == null) return null;
    return overlaySimCareerSeasons(careerApi, league, player);
  }, [careerApi, league, player]);

  useEffect(() => {
    const id = player.nbaPlayerId;
    if (!id) {
      setCareerApi([]);
      setCareerNote(null);
      return;
    }
    let cancelled = false;
    setCareerApi(null);
    setCareerNote(null);
    fetch(`/api/gm/accolades/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const payload = (await res.json()) as { awards?: AwardChip[] };
        if (!cancelled) setAwards(payload.awards ?? []);
      })
      .catch(() => {
        if (!cancelled) setAwards([]);
      });
    fetch(`/api/players/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Career request failed");
        return (await res.json()) as {
          data?: { seasons?: CareerRow[] };
        };
      })
      .then((payload) => {
        if (cancelled) return;
        const seasons = payload.data?.seasons ?? [];
        const rows = seasons.filter(
          (row) => row.season && (row.gamesPlayed ?? 0) > 0
        );
        setCareerApi(rows);
        if (rows.length === 0) {
          setCareerNote("No NBA season log on file. This save still fills the current year.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCareerApi([]);
          setCareerNote(
            "NBA career log did not load. Years played in this save still show below."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [player.nbaPlayerId]);

  return (
    <div className="flex flex-col gap-4" style={player.teamId ? teamColorStyle(player.teamId) : undefined}>
      <p className="text-sm">
        <Link
          href={
            onRoster || !player.teamId
              ? "/gm/roster"
              : `/gm/players?team=${encodeURIComponent(player.teamId)}`
          }
          className="gm-leave"
        >
          {onRoster || !team ? "Back to roster" : `Back to the ${team.name}`}
        </Link>
      </p>
      <section className="gm-player">
        <PlayerHeadshot
          playerId={player.nbaPlayerId ?? player.id}
          name={player.name}
          teamKey={player.teamId}
          size="xl"
          priority
        />
        <div className="min-w-0">
          <p className="gm-kicker inline-flex items-center gap-2">
            {team && !inDraft ? <TeamLogo teamKey={team.id} size="sm" /> : null}
            {inDraft
              ? "Draft class"
              : team
                ? `${team.city} ${team.name}`
                : "Free agent"}
            {player.jersey && !inDraft ? ` · #${player.jersey}` : ""}
          </p>
          <h2>{shownName}</h2>
          <p className="text-sm text-muted-foreground">
            {player.position} · {feet(player.heightIn)} · {player.weightLbs} lb · Age{" "}
            {player.age}
          </p>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="player-draft-history">
            {player.draftLabel || (player.draftYear!=null&&player.draftPick!=null?`${player.draftYear} draft · Pick #${player.draftPick}`:"Draft info blank")}
            {player.college ? ` · ${player.college}` : ""}
          </p>
          {awards.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {awards.map((award) => (
                <li key={award.label} className="gm-award" title={award.seasons.join(", ")}>
                  {award.label}
                  {award.count > 1 ? ` ×${award.count}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="gm-player__impact">
          <p className="score-num">{inDraft ? "??" : sheet.overall}</p>
          <p>OVR</p>
          {trait ? (
            <p
              className={cn(
                trait === "xfactor" || trait === "superstar"
                  ? "font-semibold text-amber-600 dark:text-amber-300"
                  : undefined
              )}
            >
              {traitLabel(trait)}
            </p>
          ) : inDraft ? (
            <p>Trait sealed</p>
          ) : null}
          {!inDraft ? (
            <>
              <p>
                {WAR1_LABEL} {formatWar1(value.war1, 1)}
              </p>
              <p>
                {DRBL_PUBLIC_RATE_LABEL} {formatWar1(value.drbl100, 1)}
              </p>
            </>
          ) : (
            <p>
              Ceiling {profile?.compCeiling ?? "Foggy"}
            </p>
          )}
          <p>
            {player.contract
              ? `$${formatNumber(player.contract.annualSalaryM, 1)}M · ${player.contract.yearsRemaining} yr`
              : inDraft
                ? "Undrafted"
                : "No deal"}
          </p>
        </div>
      </section>

      {!inDraft ? <SectionFrame title="Skill badges"><GmBadgeSummary player={player} />{onRoster ? <Link href="/gm/development#development-badges" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">Review badge progress and emphasis</Link> : null}</SectionFrame> : null}
      <section className="sports-card p-4">
        <h3 className="font-semibold">{inDraft ? "Scout report" : "Ratings"}</h3>
        {inDraft ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Overall and the development trait unlock when the pick is in.
              Grades below can be wrong depending on your scout.
            </p>
            <div className="mt-3 rounded-lg bg-secondary/70 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                NBA comps
              </p>
              <p className="mt-1 text-sm font-semibold">
                Ceiling {profile?.compCeiling ?? profile?.comps?.[0] ?? "Foggy"}
              </p>
              <p className="text-sm font-semibold">
                Floor {profile?.compFloor ?? profile?.comps?.[1] ?? "Foggy"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {trajectoryRead(player, scout)}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                [
                  ["Athleticism", profile?.grades.athleticism],
                  ["Shooting", profile?.grades.shooting],
                  ["Creation", profile?.grades.creation],
                  ["Defense", profile?.grades.defense],
                  ["Feel", profile?.grades.feel],
                  ["Upside", profile?.grades.upside],
                ] as const
              ).map(([label, grade]) => (
                <div key={label} className="rounded-lg bg-secondary/70 px-2.5 py-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">{grade ?? "?"}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Not in the league yet.{" "}
              <Link href="/gm/draft" className="underline underline-offset-2">
                Open the draft board
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {player.draftModel===2?"Growth depends on age, work habits, health and a realistic practice or rotation plan.":"Overall is the rating used across the league. Development trait drives how hard they grow."}
            </p>
            <p className="mt-2 text-sm" data-testid="development-outlook">
              {player.draftModel===2?"Development outlook":"Scouted potential"} {scoutRead.low}-{scoutRead.high}. {scoutRead.comment}
            </p>
            {player.sheet?.potential && player.draftModel!==2 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Peak years {player.sheet.potential.peakStart} to{" "}
                {player.sheet.potential.peakEnd}. The summer is the big jump.
                January and the end of the season move the rating a step.
              </p>
            ) : null}
            {player.sheet?.developmentReport ? (
              <div className="mt-4 rounded-lg border border-border p-3">
                <h4 className="text-sm font-semibold">Latest development check-in</h4>
                <p className="mt-2 text-sm">Age {player.sheet.developmentReport.age} · {player.sheet.developmentReport.before} → {player.sheet.developmentReport.after} OVR</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {player.sheet.developmentReport.reasons.map(reason => <li key={reason}>{reason}</li>)}
                </ul>
                {player.sheet.developmentReport.gains.length ? <p className="mt-2 text-sm">{player.sheet.developmentReport.gains.join(" · ")}</p> : null}
                {onRoster ? <Link href="/gm/franchise" className="mt-3 inline-block text-sm font-medium underline underline-offset-4">Adjust training and role</Link> : null}
              </div>
            ) : null}
          </>
        )}
        {!inDraft ? (
          <>
            <div className="mt-3 flex flex-col gap-3">
              {ATTRIBUTE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2">
                    {group.keys.map((key) => {
                      const value = sheet.attributes[key];
                      return (
                        <div key={key} className="gm-attr">
                          <span>{ATTRIBUTE_LABEL[key]}</span>
                          <span className="gm-attr__track">
                            <span style={{ width: `${value}%` }} />
                          </span>
                          <span className="tabular-nums">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <h4 className="mt-4 font-semibold">Tendencies</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              How often the player takes the action. The attribute is whether it works.
            </p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {(
                [
                  ["Close", sheet.tendencies.shootClose],
                  ["Mid", sheet.tendencies.shootMid],
                  ["Three", sheet.tendencies.shootThree],
                  ["Drive", sheet.tendencies.drive],
                  ["Post", sheet.tendencies.postUp],
                  ["Pass", sheet.tendencies.dish],
                  ["Steal", sheet.tendencies.steal],
                  ["Block", sheet.tendencies.block],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="gm-attr">
                  <span>{label}</span>
                  <span className="gm-attr__track">
                    <span style={{ width: `${value}%` }} />
                  </span>
                  <span className="tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="sports-card p-4">
        <h3 className="font-semibold">This save</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {WAR1_LABEL} {formatWar1(value.war1, 1)} · {DRBL_PUBLIC_RATE_LABEL}{" "}
          {formatWar1(value.drbl100, 1)}. Averages update as you sim.
        </p>
        {sim ? (
          <LineTable line={sim} />
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No games yet this save.</p>
        )}
        {games.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {["Game", "MIN", "PTS", "REB", "AST", "FG", "+/-"].map((label) => (
                    <th key={label} className="px-2 py-1.5 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {games.slice(0, 12).map((box) => {
                  const line = box.players.find((entry) => entry.playerId === player.id);
                  if (!line) return null;
                  const opponent =
                    line.teamId === box.homeTeamId ? box.awayTeamId : box.homeTeamId;
                  const home = line.teamId === box.homeTeamId;
                  return (
                    <tr key={box.id}>
                      <td className="px-2 py-1.5">
                        {home ? "vs" : "@"}{" "}
                        <ClubMark teamId={opponent} label={opponent.toUpperCase()} />{" "}
                        {box.awayScore}-{box.homeScore}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{line.minutes}</td>
                      <td className="px-2 py-1.5 tabular-nums">{line.points}</td>
                      <td className="px-2 py-1.5 tabular-nums">{line.rebounds}</td>
                      <td className="px-2 py-1.5 tabular-nums">{line.assists}</td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {line.fgm}-{line.fga}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {line.plusMinus > 0 ? `+${line.plusMinus}` : line.plusMinus}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {showEntrySeason && player.nbaSeason ? (
        <section className="sports-card p-4">
          <h3 className="font-semibold">NBA season they entered with</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {player.nbaSeason.season} · {player.nbaSeason.team}. Real counting from before
            this save.
          </p>
          <LineTable line={player.nbaSeason} />
        </section>
      ) : null}

      <section className="sports-card p-4">
        <h3 className="font-semibold">Career</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Per game. The year you are simming uses this save&apos;s counting line, not the
          real NBA season.
        </p>
        {careerNote ? <p className="mt-3 text-sm text-muted-foreground">{careerNote}</p> : null}
        {career == null && !careerNote ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading career…</p>
        ) : null}
        {career && career.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  {["Season", "Team", "GP", "MIN", "PTS", "REB", "AST", "FG%", "3P%", "FT%", "TS%", "PER", "WS", "BPM"].map(
                    (label) => (
                      <th key={label} className="px-2 py-1.5 font-medium">
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {career.map((row) => {
                  const gp = row.gamesPlayed ?? 0;
                  const club = clubKey(row.teamAbbreviation, row.teamName);
                  return (
                    <tr
                      key={`${row.season}-${row.teamAbbreviation ?? row.teamName}-${row.fromSim ? "sim" : "nba"}`}
                      className={club ? "gm-club-row" : undefined}
                      style={club ? teamColorStyle(club) : undefined}
                    >
                      <td className="px-2 py-1.5">
                        {row.season}
                        {row.fromSim ? (
                          <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            sim
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5">
                        <ClubMark
                          teamId={club}
                          label={row.teamAbbreviation || row.teamName || "—"}
                        />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{gp}</td>
                      <td className="px-2 py-1.5 tabular-nums">{shownRate(row.minutes, gp)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{shownRate(row.points, gp)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{shownRate(row.rebounds, gp)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{shownRate(row.assists, gp)}</td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {shownShot(row.fieldGoalsMade, row.fieldGoalsAttempted)}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {shownShot(row.threePointersMade, row.threePointersAttempted)}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {shownShot(row.freeThrowsMade, row.freeThrowsAttempted)}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{shownPct(row.trueShootingPct)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{shownNum(row.per)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{shownNum(row.winShares)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{shownNum(row.bpm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {career && career.length === 0 && !careerNote ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No seasons on file yet. Lines appear here after tip-off in this save.
          </p>
        ) : null}
      </section>
    </div>
  );
}

