"use client";

import type { ReactNode } from "react";
import { TransitionLink } from "@/components/continuity/query-nav";
import { useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamLogo } from "@/components/brand/team-logo";
import { MetricHelp } from "@/components/learn/metric-help";
import type { HomeDarkoLeader } from "@/data/queries/home";
import type { PlayerSeason } from "@/data/types";
import { formatImpact, formatPct } from "@/lib/stat-explainers";
import { BoardPlayerName } from "@/lib/board-compact-name";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const IMPACT_COLLAPSED = 8;
const EFFICIENCY_COLLAPSED = 5;

export function ImpactLeaders({ leaders }: { leaders: HomeDarkoLeader[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!leaders.length) {
    return (
      <section className="sports-card px-4 py-6 text-center text-sm text-muted-foreground">
        Impact board unavailable.
      </section>
    );
  }

  const visible = expanded ? leaders : leaders.slice(0, IMPACT_COLLAPSED);
  const canExpand = leaders.length > IMPACT_COLLAPSED;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-[20px] font-bold tracking-tight">Impact</h2>
            <MetricHelp conceptId="darko" labelClassName="text-[12px] font-semibold text-muted-foreground">
              DARKO
            </MetricHelp>
          </div>
          <p className="text-[14px] text-muted-foreground">
            Who moves the needle most per 100 possessions.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[14px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
            >
              {expanded ? "Show less" : `Show all ${leaders.length}`}
            </button>
          ) : null}
          <TransitionLink
            href="/explore/players?sort=darkoDpm"
            className="text-[14px] font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Full board
          </TransitionLink>
        </div>
      </div>
      <ol className="sports-card divide-y divide-black/5">
        {visible.map((p, i) => (
          <li key={`${p.profileId}-${p.playerName}`}>
            <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
              <span className="w-5 pt-2 text-[14px] font-bold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <PlayerIdentity
                playerId={p.profileId}
                name={p.playerName}
                nbaId={p.nbaPlayerId}
                teamKey={p.teamAbbr ?? p.teamName}
                teamLabel={p.teamAbbr ?? p.teamName}
                className="min-w-0 flex-1"
                nameClassName="w-full gap-3 no-underline hover:no-underline"
              >
                <PlayerHeadshot
                  playerId={p.profileId}
                  nbaId={p.nbaPlayerId}
                  name={p.playerName}
                  teamKey={p.teamAbbr ?? p.teamName}
                  size="sm"
                />
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-center gap-2">
                    <p className={cn(type.body, "min-w-0 font-semibold")}>
                      <BoardPlayerName name={p.playerName} />
                    </p>
                    {p.teamAbbr || p.teamName ? (
                      <TeamLogo teamKey={p.teamAbbr ?? p.teamName} size="xs" />
                    ) : null}
                  </div>
                </div>
              </PlayerIdentity>
              <div className="text-right">
                <p className="score-num text-[1.35rem] font-bold tabular-nums">
                  {formatImpact(p.impact)}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  DPM
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EfficiencyCard({
  title,
  learnHref,
  boardHref,
  boardLabel,
  rows,
  renderMeta,
}: {
  title: ReactNode;
  learnHref: string;
  boardHref: string;
  boardLabel: string;
  rows: PlayerSeason[];
  renderMeta: (p: PlayerSeason) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, EFFICIENCY_COLLAPSED);
  const canExpand = rows.length > EFFICIENCY_COLLAPSED;

  return (
    <div className="sports-card flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[16px] font-bold">{title}</h3>
        <div className="flex items-center gap-2">
          <TransitionLink
            href={learnHref}
            className="text-[12px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            Learn
          </TransitionLink>
          <TransitionLink
            href={boardHref}
            className="text-[12px] font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {boardLabel}
          </TransitionLink>
        </div>
      </div>
      <ul className="mt-1 flex flex-col gap-2">
        {visible.map((p) => (
          <li
            key={p.playerId}
            className="flex items-center gap-2 rounded-lg px-1 py-0.5"
          >
            <PlayerIdentity
              playerId={p.playerId}
              name={p.playerName}
              teamKey={p.teamName}
              teamLabel={p.teamName}
              variant="compact"
              className="min-w-0 flex-1"
              nameClassName="w-full gap-2 no-underline hover:underline"
            >
              <span className={cn(type.body, "min-w-0 flex-1 font-semibold")}>
                <BoardPlayerName name={p.playerName} />
              </span>
            </PlayerIdentity>
            {renderMeta(p)}
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="text-[14px] text-muted-foreground">No data yet.</li>
        ) : null}
      </ul>
      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 self-start text-[12px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          {expanded ? "Show less" : `Show all ${rows.length}`}
        </button>
      ) : null}
    </div>
  );
}

export function EfficiencyLeaders({
  tsLeaders,
  usageStars,
}: {
  tsLeaders: PlayerSeason[];
  usageStars: PlayerSeason[];
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <EfficiencyCard
        title={
          <MetricHelp conceptId="ts" labelClassName="text-[16px] font-bold">
            True shooting
          </MetricHelp>
        }
        learnHref="/learn/true-shooting"
        boardHref="/explore/players?sort=trueShootingPct"
        boardLabel="Full board"
        rows={tsLeaders}
        renderMeta={(p) => (
          <span className="tabular-nums text-[14px] font-bold">
            {p.trueShootingPct != null && p.trueShootingPct > 0
              ? formatPct(p.trueShootingPct)
              : "-"}
          </span>
        )}
      />
      <EfficiencyCard
        title={
          <>
            <MetricHelp conceptId="usg" labelClassName="text-[16px] font-bold">
              Usage
            </MetricHelp>
            {" × "}
            <MetricHelp conceptId="ts" labelClassName="text-[16px] font-bold">
              TS%
            </MetricHelp>
          </>
        }
        learnHref="/learn/usage"
        boardHref="/explore/players?sort=usagePct"
        boardLabel="Full board"
        rows={usageStars}
        renderMeta={(p) => (
          <>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {p.usagePct != null && p.usagePct > 0
                ? formatPct(p.usagePct)
                : "-"}
            </span>
            <span className="tabular-nums text-[14px] font-bold">
              {p.trueShootingPct != null && p.trueShootingPct > 0
                ? formatPct(p.trueShootingPct)
                : "-"}
            </span>
          </>
        )}
      />
    </section>
  );
}
