"use client";

import { Fragment, useState, type ReactNode } from "react";

import type {
  BoxScoreGameContextIndex,
  BoxScorePlayerContext,
  BoxScoreTeamContext,
} from "@/analytics/box-score-context";
import {
  BoxScoreContextBody,
  BoxScoreStatContextPanel,
} from "@/components/games/box-score-stat-context";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PlayerGame } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import { conceptIdForColumnLabel } from "@/lib/learn-column-concepts";
import { cn } from "@/lib/utils";

export function GameBoxScoreTables({
  awayLabel,
  homeLabel,
  awayTeamId,
  homeTeamId,
  awayPlayers,
  homePlayers,
  contextIndex,
}: {
  awayLabel: string;
  homeLabel: string;
  awayTeamId: string;
  homeTeamId: string;
  awayPlayers: PlayerGame[];
  homePlayers: PlayerGame[];
  contextIndex: BoxScoreGameContextIndex;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const awayTeamCtx = contextIndex.teams.find((t) => t.teamId === awayTeamId);
  const homeTeamCtx = contextIndex.teams.find((t) => t.teamId === homeTeamId);

  return (
    <div className="flex flex-col gap-6">
      {(awayTeamCtx || homeTeamCtx) && (
        <section
          aria-labelledby="team-scoring-context"
          className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2"
        >
          <h2 id="team-scoring-context" className="sr-only">
            Team scoring context
          </h2>
          {awayTeamCtx ? <TeamScoringCard label={awayLabel} ctx={awayTeamCtx} /> : null}
          {homeTeamCtx ? <TeamScoringCard label={homeLabel} ctx={homeTeamCtx} /> : null}
        </section>
      )}

      <BoxScoreSection
        heading={`${awayLabel} — traditional`}
        players={awayPlayers}
        mode="traditional"
        contextIndex={contextIndex}
        openId={openId}
        onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
      />
      <BoxScoreSection
        heading={`${homeLabel} — traditional`}
        players={homePlayers}
        mode="traditional"
        contextIndex={contextIndex}
        openId={openId}
        onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
      />
      <BoxScoreSection
        heading={`${awayLabel} — advanced`}
        players={awayPlayers}
        mode="advanced"
        contextIndex={contextIndex}
        openId={openId}
        onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
      />
      <BoxScoreSection
        heading={`${homeLabel} — advanced`}
        players={homePlayers}
        mode="advanced"
        contextIndex={contextIndex}
        openId={openId}
        onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
      />
      <p className="text-[12px] text-muted-foreground">
        Tap <span className="font-semibold text-foreground">i</span> for
        player-self context (vs season average · in-game rank). No PBP or
        fabricated impact. Column headers explain advanced abbreviations.
      </p>
    </div>
  );
}

function TeamScoringCard({
  label,
  ctx,
}: {
  label: string;
  ctx: BoxScoreTeamContext;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label} scoring
      </p>
      <p className="text-[22px] font-bold tabular-nums">{ctx.pointsDisplay}</p>
      {ctx.seasonPpgDisplay && ctx.vsSeasonDisplay ? (
        <p className="text-[12px] text-muted-foreground">
          Season avg {ctx.seasonPpgDisplay} ·{" "}
          <span className="font-semibold text-foreground">
            {ctx.vsSeasonDisplay}
          </span>
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Season average unavailable for this team/season.
        </p>
      )}
    </div>
  );
}

function HeaderLabel({ label }: { label: string }) {
  const conceptId = conceptIdForColumnLabel(label);
  if (!conceptId) return <>{label}</>;
  return (
    <MetricHelp
      conceptId={conceptId}
      labelClassName="font-medium uppercase tracking-wide"
    >
      {label}
    </MetricHelp>
  );
}

function BoxScoreSection({
  heading,
  players,
  mode,
  contextIndex,
  openId,
  onToggle,
}: {
  heading: string;
  players: PlayerGame[];
  mode: "traditional" | "advanced";
  contextIndex: BoxScoreGameContextIndex;
  openId: string | null;
  onToggle: (playerId: string) => void;
}) {
  const headingId = heading.replace(/\s+/g, "-").toLowerCase();
  const traditionalHeads = [
    "Player",
    "MIN",
    "PTS",
    "FG",
    "3P",
    "FT",
    "OREB",
    "DREB",
    "REB",
    "AST",
    "STL",
    "BLK",
    "TO",
    "PF",
    "+/-",
  ] as const;
  const advancedHeads = [
    "Player",
    "MIN",
    "PTS",
    "TS%",
    "eFG%",
    "USG%",
    "AST%",
    "TOV%",
    "REB%",
    "ORtg",
    "GmSc",
    "+/-",
  ] as const;
  const heads = mode === "traditional" ? traditionalHeads : advancedHeads;
  const colCount = heads.length;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {heading}
      </h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {heads.map((label) => (
                <TableHead
                  key={label}
                  className={label === "Player" ? undefined : "text-right"}
                >
                  <HeaderLabel label={label} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="text-muted-foreground"
                >
                  No box-score rows available for this team.
                </TableCell>
              </TableRow>
            ) : (
              players.map((p) => {
                const ctx = contextIndex.byPlayerId[p.playerId];
                const open = openId === p.playerId && mode === "traditional";
                return (
                  <Fragment key={`${p.id}-${mode}`}>
                    {mode === "traditional" ? (
                      <TraditionalRow
                        player={p}
                        context={ctx}
                        open={open}
                        onToggle={() => onToggle(p.playerId)}
                      />
                    ) : (
                      <AdvancedRow player={p} />
                    )}
                    {open && ctx ? (
                      <TableRow className="border-0 sm:hidden">
                        <TableCell
                          colSpan={colCount}
                          className="bg-secondary/25 px-3 pb-3 pt-0"
                        >
                          <div className="rounded-md border border-border bg-card px-3 py-3">
                            <BoxScoreContextBody context={ctx} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function TraditionalRow({
  player: p,
  context,
  open,
  onToggle,
}: {
  player: PlayerGame;
  context?: BoxScorePlayerContext;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow className={cn(open && "bg-secondary/30")}>
      <TableCell className="overflow-visible">
        <div className="flex min-w-[9rem] items-center gap-1">
          <PlayerIdentity
            playerId={p.playerId}
            name={p.playerName ?? p.playerId}
            teamKey={p.teamId}
            season={p.season}
            variant="compact"
            className="min-w-0 flex-1"
            nameClassName="truncate text-[13px]"
          >
            <span className="truncate">{p.playerName ?? p.playerId}</span>
          </PlayerIdentity>
          {context && context.lines.length > 0 ? (
            <BoxScoreStatContextPanel
              context={context}
              open={open}
              onToggle={onToggle}
            />
          ) : null}
        </div>
      </TableCell>
      <Num>{formatNumber(p.minutes, 0)}</Num>
      <Num>{formatNumber(p.points)}</Num>
      <Num>
        {p.fieldGoalsMade}-{p.fieldGoalsAttempted}
      </Num>
      <Num>
        {p.threePointersMade}-{p.threePointersAttempted}
      </Num>
      <Num>
        {p.freeThrowsMade}-{p.freeThrowsAttempted}
      </Num>
      <Num>{formatNumber(p.offensiveRebounds ?? 0)}</Num>
      <Num>{formatNumber(p.defensiveRebounds ?? 0)}</Num>
      <Num>{formatNumber(p.rebounds)}</Num>
      <Num>{formatNumber(p.assists)}</Num>
      <Num>{formatNumber(p.steals)}</Num>
      <Num>{formatNumber(p.blocks)}</Num>
      <Num>{formatNumber(p.turnovers)}</Num>
      <Num>{formatNumber(p.personalFouls ?? 0)}</Num>
      <Num>
        {p.plusMinus > 0 ? "+" : ""}
        {formatNumber(p.plusMinus)}
      </Num>
    </TableRow>
  );
}

function AdvancedRow({ player: p }: { player: PlayerGame }) {
  return (
    <TableRow>
      <TableCell className="overflow-visible">
        <PlayerIdentity
          playerId={p.playerId}
          name={p.playerName ?? p.playerId}
          teamKey={p.teamId}
          season={p.season}
          variant="compact"
          nameClassName="truncate text-[13px]"
        >
          <span className="truncate">{p.playerName ?? p.playerId}</span>
        </PlayerIdentity>
      </TableCell>
      <Num>{formatNumber(p.minutes, 0)}</Num>
      <Num>{formatNumber(p.points)}</Num>
      <Num>{p.trueShootingPct != null ? formatPct(p.trueShootingPct) : "-"}</Num>
      <Num>
        {p.effectiveFieldGoalPct != null
          ? formatPct(p.effectiveFieldGoalPct)
          : "-"}
      </Num>
      <Num>{p.usagePct != null ? formatPct(p.usagePct) : "-"}</Num>
      <Num>{p.assistPct != null ? formatPct(p.assistPct) : "-"}</Num>
      <Num>{p.turnoverPct != null ? formatPct(p.turnoverPct) : "-"}</Num>
      <Num>{p.reboundPct != null ? formatPct(p.reboundPct) : "-"}</Num>
      <Num>
        {p.offensiveRating != null ? formatNumber(p.offensiveRating, 1) : "-"}
      </Num>
      <Num>{p.gameScore != null ? formatNumber(p.gameScore, 1) : "-"}</Num>
      <Num>
        {p.plusMinus > 0 ? "+" : ""}
        {formatNumber(p.plusMinus)}
      </Num>
    </TableRow>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <TableCell className="text-right tabular-nums">{children}</TableCell>;
}
