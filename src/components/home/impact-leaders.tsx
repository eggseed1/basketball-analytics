"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useState } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import type { HomeDarkoLeader } from "@/data/queries/home";
import type { PlayerSeason } from "@/data/types";
import { formatImpact, formatPct } from "@/lib/stat-explainers";

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
            <h2 className="text-[17px] font-bold tracking-tight">Impact</h2>
            <Link
              href="/learn/darko"
              className="text-[12px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
            >
              DARKO
            </Link>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Who moves the needle most per 100 possessions.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
            >
              {expanded ? "Show less" : `Show all ${leaders.length}`}
            </button>
          ) : null}
          <Link
            href="/explore/players?sort=darkoDpm"
            className="text-[13px] font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Full board
          </Link>
        </div>
      </div>
      <ol className="sports-card divide-y divide-black/5">
        {visible.map((p, i) => (
          <li key={`${p.profileId}-${p.playerName}`}>
            <Link
              href={`/players/${p.profileId}`}
              className="flex gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
            >
              <span className="w-5 pt-2 text-[13px] font-bold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <PlayerHeadshot
                playerId={p.profileId}
                nbaId={p.nbaPlayerId}
                name={p.playerName}
                teamKey={p.teamAbbr ?? p.teamName}
                size="sm"
              />
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[15px] font-semibold underline-offset-2 group-hover:underline">
                    {p.playerName}
                  </p>
                  {p.teamAbbr || p.teamName ? (
                    <TeamLogo teamKey={p.teamAbbr ?? p.teamName} size="xs" />
                  ) : null}
                </div>
              </div>
              <div className="text-right">
                <p className="score-num text-[1.35rem] font-bold tabular-nums">
                  {formatImpact(p.impact)}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  DPM
                </p>
              </div>
            </Link>
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
  title: string;
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
        <h3 className="text-[15px] font-bold">{title}</h3>
        <div className="flex items-center gap-2">
          <Link
            href={learnHref}
            className="text-[11px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            Learn
          </Link>
          <Link
            href={boardHref}
            className="text-[11px] font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {boardLabel}
          </Link>
        </div>
      </div>
      <ul className="mt-1 flex flex-col gap-2">
        {visible.map((p) => (
          <li key={p.playerId}>
            <Link
              href={`/players/${p.playerId}`}
              className="flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-secondary/60"
            >
              <PlayerHeadshot
                playerId={p.playerId}
                name={p.playerName}
                teamKey={p.teamName}
                size="xs"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {p.playerName}
              </span>
              {renderMeta(p)}
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="text-[13px] text-muted-foreground">No data yet.</li>
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
        title="True shooting"
        learnHref="/learn/true-shooting"
        boardHref="/explore/players?sort=trueShootingPct"
        boardLabel="Full board"
        rows={tsLeaders}
        renderMeta={(p) => (
          <span className="tabular-nums text-[13px] font-bold">
            {formatPct(p.trueShootingPct)}
          </span>
        )}
      />
      <EfficiencyCard
        title="Usage × TS%"
        learnHref="/learn/usage"
        boardHref="/explore/players?sort=usagePct"
        boardLabel="Full board"
        rows={usageStars}
        renderMeta={(p) => (
          <>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {formatPct(p.usagePct)}
            </span>
            <span className="tabular-nums text-[13px] font-bold">
              {formatPct(p.trueShootingPct)}
            </span>
          </>
        )}
      />
    </section>
  );
}
