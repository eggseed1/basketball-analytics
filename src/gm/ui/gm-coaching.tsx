"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DEFENSE_OPTIONS,
  OFFENSE_OPTIONS,
  POSITION_MINUTE_TARGET,
  ROTATION_DEPTH_OPTIONS,
  TEMPO_OPTIONS,
  coachingOf,
  injured,
  minutesPerPosition,
  rotationChart,
  validShiftPlan,
  rotationQuality,
  suggestedMinutePlan,
  suggestedMinutes,
} from "@/gm/engine/coaching";
import {
  POSITIONS,
  overallAtPosition,
  overallOf,
  resolveCoverSlot,
  secondaryOptions,
} from "@/gm/engine/lineup";
import { displayPlayerName, userPlayers, userTeam } from "@/gm/lib/selectors";
import { useGmStore } from "@/gm/state/gm-store";
import type { GmPlayer, GmPosition, GmRotationDepth } from "@/gm/types";
import { cn } from "@/lib/utils";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

/** One decimal is enough for a minute book; never dump float noise. */
function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function rosterOrder(
  players: GmPlayer[],
  starters: Record<GmPosition, string | null>,
  minutes: Record<string, number>
) {
  const starterIds = POSITIONS.map((pos) => starters[pos]).filter(
    (id): id is string => !!id
  );
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

function healthClass(health: "good" | "thin" | "heavy"): string {
  if (health === "good") return "is-good";
  if (health === "thin") return "is-thin";
  return "is-heavy";
}

export function GmCoaching() {
  const t = useTranslations("GmUi");
  const league = useGmStore((s) => s.league);
  const setStarter = useGmStore((s) => s.setStarter);
  const setPlayerPosition = useGmStore((s) => s.setPlayerPosition);
  const setPlayerSecondary = useGmStore((s) => s.setPlayerSecondary);
  const setCoaching = useGmStore((s) => s.setCoaching);
  const setRotationMinutes = useGmStore((s) => s.setRotationMinutes);
  const autoBalanceRotation = useGmStore((s) => s.autoBalanceRotation);
  const setRotationDepth = useGmStore((s) => s.setRotationDepth);
  const resetRotation = useGmStore((s) => s.resetRotation);
  if (!league) return null;

  const team = userTeam(league);
  const players = userPlayers(league);
  const plan = coachingOf(team);
  const saved = team.coaching?.minutes;
  const starterIds = new Set(
    POSITIONS.map((pos) => team.starters[pos]).filter((id): id is string => !!id)
  );
  const book = suggestedMinutePlan(team, players);
  const targets = book.minutes;
  // Minute totals come from the positional book (or the saved plan).
  // The shift chart only decides when people are on the floor.
  const minutes: Record<string, number> = {};
  for (const player of players) {
    minutes[player.id] = injured(player)
      ? 0
      : saved
        ? (saved[player.id] ?? 0)
        : (targets[player.id] ?? 0);
  }
  // Saved cover wins when present; fill gaps so every minute has one seat.
  const coverSlot = resolveCoverSlot(players, minutes, {
    ...book.coverSlot,
    ...(team.coaching?.coverSlot ?? {}),
  });
  const painted = validShiftPlan(plan.shifts, players.filter(p => !injured(p)).map(p => p.id)) ?? rotationChart(
    players.map((player) => ({
      id: player.id,
      minutes: minutes[player.id] ?? 0,
      starter: starterIds.has(player.id),
      position: coverSlot[player.id] ?? player.position,
    })),
    plan
  );
  const suggested = suggestedMinutes(team, players);
  const total = Object.values(minutes).reduce((sum, value) => sum + value, 0);
  const remaining = 240 - total;
  const ordered = rosterOrder(players, team.starters, minutes);
  const chart = new Map(painted.map((row) => [row.id, row.on]));
  const positionRows = minutesPerPosition(players, minutes, coverSlot, team.coaching?.positionMinutes);
  const quality = rotationQuality(players, minutes, coverSlot);
  const offense = OFFENSE_OPTIONS.find((option) => option.id === plan.offense);
  const defense = DEFENSE_OPTIONS.find((option) => option.id === plan.defense);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{t("pageLineupTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("pageLineupBlurb")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => autoBalanceRotation()}>
            {t("coachAutoBalance", { depth: plan.rotationDepth ?? "" })}
          </Button>
          <Button variant="outline" size="sm" onClick={() => resetRotation()}>
            {t("coachReset")}
          </Button>
        </div>
      </div>

      <section className="sports-card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t("coachRotationSize")}</span>
            <select
              className="rounded-md border border-border bg-background px-2 py-2"
              value={plan.rotationDepth}
              aria-label={t("coachRotationSize")}
              onChange={(event) =>
                setRotationDepth(Number(event.target.value) as GmRotationDepth)
              }
            >
              {ROTATION_DEPTH_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="max-w-md pb-2 text-sm text-muted-foreground">
            {t("coachSizeNote")}{" "}
            {ROTATION_DEPTH_OPTIONS.find((option) => option.id === plan.rotationDepth)?.detail}
          </p>
        </div>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("coachOffense")}</h3>
        <div className="flex flex-wrap gap-2">
          {OFFENSE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === plan.offense ? "gm-nav__link is-active" : "gm-nav__link"}
              onClick={() => setCoaching({ offense: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{offense?.detail}</p>
        <div className="flex flex-wrap gap-3">
          <PlayThrough
            label={t("coachFirstOption")}
            value={plan.playThrough[0]}
            players={players}
            onChange={(id) => setCoaching({ playThrough: [id, plan.playThrough[1]] })}
          />
          <PlayThrough
            label={t("coachSecondOption")}
            value={plan.playThrough[1]}
            players={players}
            onChange={(id) => setCoaching({ playThrough: [plan.playThrough[0], id] })}
          />
        </div>
        <h3 className="font-semibold">{t("coachTempo")}</h3>
        <div className="flex flex-wrap gap-2">
          {TEMPO_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === plan.tempo ? "gm-nav__link is-active" : "gm-nav__link"}
              onClick={() => setCoaching({ tempo: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("coachDefense")}</h3>
        <div className="flex flex-wrap gap-2">
          {DEFENSE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === plan.defense ? "gm-nav__link is-active" : "gm-nav__link"}
              onClick={() => setCoaching({ defense: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{defense?.detail}</p>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{t("coachMinutesPerPosition")}</h3>
          <p className="text-sm tabular-nums text-muted-foreground">
            {t("coachBalance", {
              score: Math.round(quality * 100),
              target: POSITION_MINUTE_TARGET,
            })}
          </p>
        </div>
        <div className="gm-pos-mins">
          <div className="gm-pos-mins__head" aria-hidden>
            <span>{t("coachColPosition")}</span>
            <span />
            <span>{t("coachColPrimary")}</span>
            <span>{t("coachColSecondary")}</span>
          </div>
          {positionRows.map((row) => (
            <div key={row.position} className="gm-pos-mins__row">
              <span className="gm-pos-mins__pos">{row.position}</span>
              <div className="gm-pos-mins__track" aria-hidden>
                <span
                  className={cn("gm-pos-mins__fill", healthClass(row.health))}
                  style={{
                    width: `${Math.min(100, (row.total / 64) * 100)}%`,
                  }}
                />
                <span
                  className="gm-pos-mins__mark"
                  style={{ left: `${(POSITION_MINUTE_TARGET / 64) * 100}%` }}
                />
              </div>
              <span className="tabular-nums">{formatMinutes(row.primary)}</span>
              <span className="tabular-nums">{formatMinutes(row.secondary)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{t("coachRotations")}</h3>
          <p className="text-sm tabular-nums">
            {t("coachRemaining", { value: formatMinutes(remaining) })}
            {remaining < 0
              ? t("coachOverBook")
              : remaining > 12
                ? t("coachOpenMinutes")
                : ""}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {POSITIONS.map((pos) => (
            <label key={pos} className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("coachStarterPos", { pos })}
              </span>
              <select
                className="rounded-md border border-border bg-background px-2 py-2"
                value={team.starters[pos] ?? ""}
                onChange={(event) => setStarter(pos, event.target.value || null)}
              >
                <option value="">{t("coachEmpty")}</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {displayPlayerName(player)} ({player.position})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="gm-rot gm-rot--board gm-rot--head" aria-hidden>
          <span>{t("coachColName")}</span>
          <span>{t("coachColPriSec")}</span>
          <span>OVR</span>
          <span>{t("coachColMinutes")}</span>
          <span>{t("coachColSuggested")}</span>
        </div>
        <ul className="flex flex-col gap-2">
          {ordered.map((player, index) => {
            const value = minutes[player.id] ?? 0;
            const out = injured(player);
            const on = chart.get(player.id) ?? [];
            const ovr = overallOf(player);
            const wish = suggested[player.id] ?? 0;
            const delta = wish - value;
            const rank = starterIds.has(player.id) ? player.position : String(index + 1);
            return (
              <li key={player.id} className="gm-rot gm-rot--board">
                <div className="gm-rot__name">
                  <Link href={`/gm/player/${encodeURIComponent(player.id)}`}>
                    {displayPlayerName(player)}
                  </Link>
                  <span>
                    {starterIds.has(player.id)
                      ? t("coachStarter")
                      : t("coachRotationN", { n: index + 1 })}
                    {out ? ` · ${t("nightOut")}` : ""}
                  </span>
                </div>
                <div className="gm-rot__pos">
                  <label>
                    <span className="sr-only">{t("coachPrimaryPos")}</span>
                    <select
                      className="rounded-md border border-border bg-background px-1.5 py-1 text-[12px] font-semibold"
                      value={player.position}
                      disabled={out}
                      aria-label={t("coachPrimaryAria", { player: displayPlayerName(player) })}
                      onChange={(event) =>
                        setPlayerPosition(player.id, event.target.value as GmPosition)
                      }
                    >
                      {POSITIONS.map((pos) => {
                        const at = overallAtPosition(player, pos);
                        const diff = at - ovr;
                        return (
                          <option key={pos} value={pos}>
                            {pos}
                            {diff !== 0 ? ` (${diff > 0 ? "+" : ""}${diff})` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">{t("coachSecondaryPos")}</span>
                    <select
                      className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] font-semibold text-muted-foreground"
                      value={player.secondaryPosition ?? ""}
                      disabled={out}
                      aria-label={t("coachSecondaryAria", { player: displayPlayerName(player) })}
                      onChange={(event) =>
                        setPlayerSecondary(
                          player.id,
                          (event.target.value || null) as GmPosition | null
                        )
                      }
                    >
                      <option value="">{t("coachSecNone")}</option>
                      {secondaryOptions(player.position).map((pos) => (
                        <option key={pos} value={pos}>
                          {t("coachSecPos", { pos })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="gm-rot__rank">{rank}</span>
                </div>
                <div className="gm-rot__ovr tabular-nums">
                  <span>{ovr}</span>
                  {player.sheet?.priorOverall != null &&
                  player.sheet.priorOverall !== ovr ? (
                    <span
                      className={cn(
                        "gm-rot__delta",
                        ovr > player.sheet.priorOverall ? "is-up" : "is-down"
                      )}
                    >
                      {ovr > player.sheet.priorOverall ? "▲" : "▼"}{" "}
                      {Math.abs(ovr - player.sheet.priorOverall)}
                    </span>
                  ) : null}
                </div>
                <div className="gm-rot__mins">
                  <label className="gm-rot__slider">
                    <input
                      type="range"
                      min={0}
                      max={40}
                      step={1}
                      value={value}
                      disabled={out}
                      aria-label={t("coachMinutesAria", { player: displayPlayerName(player) })}
                      onChange={(event) =>
                        setRotationMinutes(player.id, Number(event.target.value))
                      }
                    />
                    <span className="tabular-nums">{formatMinutes(value)}</span>
                  </label>
                  <div className="gm-chart" aria-hidden>
                    {QUARTERS.map((quarter) => (
                      <span key={quarter} className="gm-chart__slice">
                        {[0, 1, 2, 3, 4, 5].map((offset) => {
                          const cellIndex = QUARTERS.indexOf(quarter) * 6 + offset;
                          return (
                            <span
                              key={offset}
                              className={
                                on[cellIndex] ? "gm-chart__cell is-on" : "gm-chart__cell"
                              }
                            />
                          );
                        })}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="gm-rot__suggested tabular-nums">
                  <span>{formatMinutes(wish)}</span>
                  {Math.abs(delta) >= 0.05 && !out ? (
                    <span className={cn("gm-rot__delta", delta > 0 ? "is-up" : "is-down")}>
                      {delta > 0 ? "▲" : "▼"} {formatMinutes(Math.abs(delta))}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function PlayThrough({
  label,
  value,
  players,
  onChange,
}: {
  label: string;
  value: string | null;
  players: GmPlayer[];
  onChange: (id: string | null) => void;
}) {
  const t = useTranslations("GmUi");
  return (
    <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        className="rounded-md border border-border bg-background px-2 py-2"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">{t("coachNoOne")}</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {displayPlayerName(player)}
          </option>
        ))}
      </select>
    </label>
  );
}

