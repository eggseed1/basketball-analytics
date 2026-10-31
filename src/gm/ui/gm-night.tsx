"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  SHIFT_SLOTS,
  coachingOf,
  injured,
  rotationChart,
  schemeHeadline,
  toggleShift,
  validShiftPlan,
  type ChartRow,
} from "@/gm/engine/coaching";
import { positionalMinuteTargets } from "@/gm/engine/lineup";
import { displayPlayerName, nextUserGame, userPlayers, userTeam } from "@/gm/lib/selectors";
import { formatAppDateTime } from "@/i18n/format-date";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmPlayer, GmPosition } from "@/gm/types";

const POS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function rosterOrder(
  players: GmPlayer[],
  starters: Record<GmPosition, string | null>,
  minutes: Record<string, number>
) {
  const starterIds = POS.map((pos) => starters[pos]).filter((id): id is string => !!id);
  const used = new Set(starterIds);
  const rest = players
    .filter((player) => !used.has(player.id))
    .sort((a, b) => (minutes[b.id] ?? 0) - (minutes[a.id] ?? 0));
  const byId = new Map(players.map((player) => [player.id, player]));
  return [
    ...starterIds.map((id) => byId.get(id)).filter((player): player is GmPlayer => !!player),
    ...rest,
  ];
}

function paint(players: GmPlayer[], starters: Record<GmPosition, string | null>, saved: Record<string, number> | undefined, coaching: ReturnType<typeof coachingOf>) {
  const starterIds = new Set(POS.map((pos) => starters[pos]).filter((id): id is string => !!id));
  const targets = positionalMinuteTargets(
    players.filter((player) => !injured(player)),
    starters
  );
  const cover = coaching.coverSlot;
  return validShiftPlan(coaching.shifts, players.filter(p => !injured(p)).map(p => p.id)) ?? rotationChart(
    players.map((player) => ({
      id: player.id,
      minutes: injured(player) ? 0 : saved ? (saved[player.id] ?? 0) : (targets[player.id] ?? 0),
      starter: starterIds.has(player.id),
      position: cover?.[player.id] ?? player.position,
    })),
    coaching
  );
}

export function GmNight() {
  const t = useTranslations("GmUi");
  const locale = useLocale();
  const league = useGmStore((s) => s.league);
  const setCoaching = useGmStore((s) => s.setCoaching);
  const simulateNextGame = useGmStore((s) => s.simulateNextGame);
  const router = useRouter();
  const [rows, setRows] = useState<ChartRow[] | null>(null);
  const [slot, setSlot] = useState(0);
  const [walking, setWalking] = useState(false);
  const [dirty, setDirty] = useState(false);

  const team = league ? userTeam(league) : null;
  const players = league ? userPlayers(league) : [];
  const next = league ? nextUserGame(league) : undefined;
  const plan = team ? coachingOf(team) : null;

  const baseline = useMemo(() => {
    if (!team || !plan) return null;
    return paint(players, team.starters, team.coaching?.minutes, plan);
  }, [team, players, plan]);

  useEffect(() => {
    if (!baseline || rows) return;
    setRows(baseline);
  }, [baseline, rows]);

  useEffect(() => {
    if (!walking) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWalking(false);
      return;
    }
    const id = window.setInterval(() => {
      setSlot((current) => {
        if (current >= SHIFT_SLOTS - 1) {
          setWalking(false);
          return current;
        }
        return current + 1;
      });
    }, 700);
    return () => window.clearInterval(id);
  }, [walking]);

  if (!league || !team || !plan || !rows) return null;

  const names = new Map(players.map((player) => [player.id, displayPlayerName(player)]));
  const minutes = Object.fromEntries(rows.map((row) => [row.id, row.minutes]));
  const ordered = rosterOrder(players, team.starters, minutes);
  const chart = new Map(rows.map((row) => [row.id, row]));
  const onFloor = rows.filter((row) => row.on[slot]).map((row) => lastName(names.get(row.id) ?? row.id));
  const quarter = Math.floor(slot / 6) + 1;
  const clock = 12 - (slot % 6) * 2;
  const scheme = schemeHeadline(plan);
  const opponent = next
    ? next.homeTeamId === team.id
      ? next.awayTeamId
      : next.homeTeamId
    : null;

  const tipDate =
    next?.gameDate && /^\d{4}-\d{2}-\d{2}$/.test(next.gameDate)
      ? formatAppDateTime(`${next.gameDate}T12:00:00Z`, locale, {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      : "";

  const tip = () => {
    if (dirty) {
      setCoaching({ minutes, shifts: Object.fromEntries(rows.map(row => [row.id, row.on])) });
    }
    const boxId = simulateNextGame();
    if (boxId) router.push(`/gm/game/${boxId}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t("pageNightTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {next
              ? `${t(
                  `night${next.homeTeamId === team.id ? "Home" : "Away"}Vs${tipDate ? "Date" : ""}`,
                  { opponent: opponent?.toUpperCase() ?? "", date: tipDate }
                )} ${t("pageNightBlurb")}`
              : t("nightNoGame")}
            {scheme ? ` ${scheme}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setWalking((value) => !value)}>
            {walking ? t("nightPause") : t("nightWalk")}
          </Button>
          <Button size="sm" disabled={!next} onClick={tip}>
            {t("nightTip")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!next}
            onClick={() => {
              if (dirty) setCoaching({ minutes, shifts: Object.fromEntries(rows.map(row => [row.id, row.on])) });
              const boxId = simulateNextGame();
              if (boxId) router.push(`/gm/game/${boxId}?watch=1`);
            }}
          >
            {t("nightWatch")}
          </Button>
        </div>
      </div>

      <p className="text-sm font-semibold">
        {t("nightFloor", {
          quarter,
          clock,
          names: onFloor.join(", ") || t("nightNoOne"),
        })}
      </p>

      <section className="sports-card flex flex-col gap-3 p-4">
        <div className="gm-rot gm-rot--night gm-rot--head" aria-hidden>
          <span />
          <div className="gm-chart">
            {QUARTERS.map((quarterLabel, index) => (
              <span key={quarterLabel} className={index + 1 === quarter ? "gm-chart__q is-now" : "gm-chart__q"}>
                {quarterLabel}
              </span>
            ))}
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {ordered.map((player) => {
            const row = chart.get(player.id);
            const on = row?.on ?? [];
            const out = injured(player);
            return (
              <li key={player.id} className="gm-rot gm-rot--night">
                <div className="gm-rot__name">
                  <Link href={`/gm/player/${encodeURIComponent(player.id)}`}>
                    {displayPlayerName(player)}
                  </Link>
                  <span>
                    {player.position}
                    {out
                      ? ` · ${t("nightOut")}`
                      : ` · ${t("nightMinutes", { minutes: row?.minutes ?? 0 })}`}
                  </span>
                </div>
                <div className="gm-chart">
                  {QUARTERS.map((quarterLabel, quarterIndex) => (
                    <span key={quarterLabel} className="gm-chart__slice">
                      {[0, 1, 2, 3, 4, 5].map((offset) => {
                        const index = quarterIndex * 6 + offset;
                        const lit = !!on[index];
                        return (
                          <button
                            key={offset}
                            type="button"
                            disabled={out}
                            aria-label={t("nightBlockAria", {
                              player: displayPlayerName(player),
                              quarter: quarterLabel,
                              block: offset + 1,
                            })}
                            className={
                              lit
                                ? index === slot
                                  ? "gm-chart__cell is-on is-now"
                                  : "gm-chart__cell is-on"
                                : index === slot
                                  ? "gm-chart__cell is-now"
                                  : "gm-chart__cell"
                            }
                            onClick={() => {
                              setWalking(false);
                              const swapped = toggleShift(rows, player.id, index);
                              if (swapped === rows) return;
                              setRows(swapped);
                              setDirty(true);
                            }}
                          />
                        );
                      })}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">
          {dirty ? t("nightPlanLocked") : t("nightPlanAuto")}{" "}
          <Link href="/gm/lineup" className="font-semibold underline-offset-4 hover:underline">
            {t("nightSystemsLink")}
          </Link>
        </p>
      </section>
    </div>
  );
}

