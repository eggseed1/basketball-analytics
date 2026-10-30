"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LogOut, Maximize2, Minimize2 } from "lucide-react";

import { TeamLogo } from "@/components/brand/team-logo";
import { GmSaveImport } from "@/gm/ui/gm-franchise-desk";
import { useGmStore } from "@/gm/state/gm-store";
import { useMyLeagueStore } from "@/gm/myleague/store";
import { GmCheckpointBanner } from "@/gm/ui/gm-checkpoint-banner";
import { GmIncomingOfferBanner } from "@/gm/ui/gm-incoming-offer-banner";
import { GmScoutingFocusBanner } from "@/gm/ui/gm-scouting-focus-banner";
import { GmNav } from "@/gm/ui/gm-nav";
import { FRANCHISES } from "@/gm/seed/franchises";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { leagueHasRealPlayers } from "@/gm/lib/counting";
import { userRecord, userTeam } from "@/gm/lib/selectors";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { ESPN_PLAYER_SEASON_HORIZON_START } from "@/gm/myleague/constants";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import "./gm-stage.css";

type FullscreenNode = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

async function enterFullscreen(el: HTMLElement) {
  const node = el as FullscreenNode;
  if (typeof node.requestFullscreen === "function") {
    await node.requestFullscreen({ navigationUI: "hide" });
    return;
  }
  node.webkitRequestFullscreen?.();
}

async function exitFullscreen() {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await doc.webkitExitFullscreen?.();
}

async function toggleFullscreen(
  el: HTMLElement | null,
  full: boolean,
  setFull: (next: boolean) => void
) {
  if (full) {
    window.sessionStorage.removeItem("gm-full");
    delete document.documentElement.dataset.gmFull;
    setFull(false);
    await exitFullscreen().catch(() => undefined);
    return;
  }
  window.sessionStorage.setItem("gm-full", "1");
  document.documentElement.dataset.gmFull = "1";
  setFull(true);
  if (!el) return;
  try {
    await enterFullscreen(el);
  } catch {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      /* The desk still covers the site header if the window stays. */
    }
  }
}

function formatSaveWhen(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso.slice(0, 10);
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(time));
  } catch {
    return iso.slice(0, 10);
  }
}

export function GmShell({
  children,
  accentTeamId,
}: {
  children: ReactNode;
  /** When the screen is about another club, the desk uses their colors. */
  accentTeamId?: string | null;
}) {
  const t = useTranslations("GmUi");
  const league = useGmStore((s) => s.league);
  const hydrated = useGmStore((s) => s.hydrated);
  const seeding = useGmStore((s) => s.seeding);
  const seedError = useGmStore((s) => s.seedError);
  const saves = useGmStore((s) => s.saves);
  const setHydrated = useGmStore((s) => s.setHydrated);
  const refreshSaves = useGmStore((s) => s.refreshSaves);
  const newLeague = useGmStore((s) => s.newLeague);
  const newGeneratedLeague = useGmStore((s) => s.newGeneratedLeague);
  const leaveToHub = useGmStore((s) => s.leaveToHub);
  const resumeSave = useGmStore((s) => s.resumeSave);
  const deleteSave = useGmStore((s) => s.deleteSave);
  const mlHydrated = useMyLeagueStore((s) => s.hydrated);
  const ensureBootstrapped = useMyLeagueStore((s) => s.ensureBootstrapped);
  const [season, setSeason] = useState(
    canonicalSeasonFromStartYear(currentNbaStartYear())
  );
  const [full, setFull] = useState(false);
  const deskRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("gm-full") === "1";
    if (stored) {
      document.documentElement.dataset.gmFull = "1";
      setFull(true);
    }
    const onChange = () => {
      // Browser Fullscreen API drops on tab switches and when GmShell remounts
      // between nav links (each page owns its own desk). Keep the desk-cover
      // preference; only the minimize control clears it.
      if (document.fullscreenElement) return;
      if (window.sessionStorage.getItem("gm-full") === "1") {
        document.documentElement.dataset.gmFull = "1";
        setFull(true);
        return;
      }
      delete document.documentElement.dataset.gmFull;
      setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const hasLeague = Boolean(league);

  // After a soft nav remount or returning to the tab, put the new desk back
  // into the Fullscreen API when the user still wants immersive mode.
  useEffect(() => {
    if (!full || !hasLeague) return;
    const el = deskRef.current;
    if (!el) return;

    let cancelled = false;
    const tryEnter = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (document.fullscreenElement === el) return;
      if (document.fullscreenElement) return;
      void enterFullscreen(el).catch(() => {
        void document.documentElement
          .requestFullscreen({ navigationUI: "hide" })
          .catch(() => undefined);
      });
    };

    const timer = window.setTimeout(tryEnter, 40);
    const onVis = () => {
      if (document.visibilityState === "visible") tryEnter();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [full, hasLeague]);

  useEffect(() => {
    if (!hydrated) {
      const t = setTimeout(() => setHydrated(true), 50);
      return () => clearTimeout(t);
    }
    void refreshSaves();
  }, [hydrated, setHydrated, refreshSaves]);

  useEffect(() => {
    if (!hydrated || !mlHydrated || !league) return;
    ensureBootstrapped(league);
  }, [
    hydrated,
    mlHydrated,
    league?.season,
    league?.phase,
    league?.day,
    league?.userTeamId,
    ensureBootstrapped,
    league,
  ]);

  if (!hydrated) {
    return (
      <main data-gm data-motion-page className="site-shell flex flex-1 flex-col gap-4 py-8">
        <MotionReveal />
        <p className="text-muted-foreground">{t("loadingOffice")}</p>
      </main>
    );
  }

  if (!league) {
    const currentStart = currentNbaStartYear();
    const seasonOptions: string[] = [];
    for (let y = currentStart; y >= ESPN_PLAYER_SEASON_HORIZON_START; y -= 1) {
      seasonOptions.push(canonicalSeasonFromStartYear(y));
    }

    return (
      <main
        data-gm
        data-motion-page
        className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8"
      >
        <MotionReveal />
        <p className="gm-disclaimer">
          {t("startDisclaimer", { note: t("fictionNote") })}
        </p>
        <div>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
            {t("myTeams")}
          </h1>
          <p className="mt-1 max-w-2xl text-[15px] text-muted-foreground">
            {t("myTeamsBlurb", { year: ESPN_PLAYER_SEASON_HORIZON_START })}
          </p>
        </div>

        {saves.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold tracking-tight">
              {t("continueSaves")}
            </h2>
            <ul className="flex flex-col gap-2">
              {saves.map((save) => {
                const phaseKey = `phase_${save.phase}` as
                  | "phase_preseason"
                  | "phase_regular"
                  | "phase_play_in"
                  | "phase_playoffs"
                  | "phase_draft"
                  | "phase_free_agency"
                  | "phase_offseason";
                const phaseLabel = t.has(phaseKey) ? t(phaseKey) : save.phase;
                return (
                  <li
                    key={save.id}
                    className="sports-card flex flex-wrap items-center gap-3 px-3 py-3"
                    style={teamColorStyle(save.userTeamId)}
                  >
                    <TeamLogo teamKey={save.userTeamId} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{save.label}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {phaseLabel}
                        {" · "}
                        {t("saveUpdated", { when: formatSaveWhen(save.updatedAt) })}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="gm-nav__link is-active"
                      disabled={seeding}
                      onClick={() => void resumeSave(save.id)}
                    >
                      {t("continueSave")}
                    </button>
                    <button
                      type="button"
                      className="gm-nav__link"
                      disabled={seeding}
                      onClick={() => {
                        if (
                          typeof window !== "undefined" &&
                          window.confirm(t("deleteSaveConfirm", { label: save.label }))
                        ) {
                          void deleteSave(save.id);
                        }
                      }}
                    >
                      {t("deleteSave")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <GmSaveImport />
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-[15px] font-semibold tracking-tight">
            {t("newFranchise")}
          </h2>
          <label className="text-[13px] font-semibold text-muted-foreground">
            {t("season")}
          </label>
          <select
            value={season}
            disabled={seeding}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-full border-0 bg-secondary px-3 py-1.5 text-[13px] font-semibold outline-none"
          >
            {seasonOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {seeding ? (
          <div className="sports-card px-4 py-6 text-center text-[15px] text-muted-foreground">
            {t("loadingPlayers", { season })}
          </div>
        ) : null}

        {seedError ? (
          <div className="sports-card px-4 py-3 text-[13px] text-muted-foreground">
            {t("seedIssue", { error: seedError })}
          </div>
        ) : null}

        <div data-motion-list className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {FRANCHISES.map((f) => {
            const brand = resolveTeamBrand(f.id);
            return (
              <button
                key={f.id}
                type="button"
                disabled={seeding}
                onClick={() => void newLeague(f.id, season)}
                className="group flex flex-col items-center gap-2 disabled:opacity-50"
              >
                <span
                  className="gm-pick flex size-[4.5rem] items-center justify-center group-disabled:transform-none"
                  style={
                    brand
                      ? ({ ["--pick" as string]: brand.primary } as CSSProperties)
                      : undefined
                  }
                >
                  <TeamLogo teamKey={f.id} size="lg" />
                </span>
                <span className="text-center text-[13px] font-medium">
                  {f.abbr}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={seeding}
          onClick={() => newGeneratedLeague("bos")}
          className="self-start text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("generatedDemo")}
        </button>
      </main>
    );
  }

  const team = userTeam(league);
  const record = userRecord(league);
  const phaseKey = `phase_${league.phase}` as
    | "phase_preseason"
    | "phase_regular"
    | "phase_play_in"
    | "phase_playoffs"
    | "phase_draft"
    | "phase_free_agency"
    | "phase_offseason";
  const phaseLabel = t.has(phaseKey) ? t(phaseKey) : league.phase;

  return (
    <main
      ref={deskRef}
      data-gm
      data-motion-page
      className="site-shell flex flex-1 flex-col gap-4 py-4 sm:py-6"
      style={teamColorStyle(accentTeamId || team.id)}
    >
      <MotionReveal />
      <header className="gm-mast">
        <TeamLogo teamKey={team.id} size="md" priority />
        <div className="gm-mast__id">
          <h1>
            {team.city} {team.name}
          </h1>
          <p className="gm-mast__meta">
            <span className="gm-phase" data-phase={league.phase}>
              {phaseLabel}
            </span>
            <span>
              {league.season - 1}-{String(league.season).slice(-2)}
            </span>
            <span>{t("day", { day: league.day })}</span>
          </p>
        </div>
        <p className="gm-mast__record score-num">
          {record?.wins ?? 0}-{record?.losses ?? 0}
        </p>
        <div className="gm-mast__tools">
          <button
            type="button"
            className="gm-mast__tool"
            aria-label={full ? t("exitFullscreen") : t("fullscreen")}
            title={full ? t("exitFullscreen") : t("fullscreen")}
            onClick={() => {
              void toggleFullscreen(deskRef.current, full, setFull);
            }}
          >
            {full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          </button>
          <button
            type="button"
            className="gm-mast__tool"
            aria-label={t("leaveLeague")}
            title={t("leaveLeague")}
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                window.confirm(t("leaveConfirm"))
              ) {
                void leaveToHub();
              }
            }}
          >
            <LogOut aria-hidden />
          </button>
        </div>
      </header>
      <p className="gm-disclaimer">{t("fictionNote")}</p>
      {league.season >= currentNbaStartYear() + 1 ? null : (
        <div className="sports-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            {t("loadCurrentRosters", {
              old: `${league.season - 1}-${String(league.season).slice(-2)}`,
              season: canonicalSeasonFromStartYear(currentNbaStartYear()),
            })}
          </p>
          <button
            type="button"
            className="gm-nav__link is-active"
            disabled={seeding}
            onClick={() =>
              void newLeague(
                league.userTeamId,
                canonicalSeasonFromStartYear(currentNbaStartYear()),
                { replace: true }
              )
            }
          >
            {seeding
              ? t("loadingRosters")
              : t("loadCurrentButton", {
                  season: canonicalSeasonFromStartYear(currentNbaStartYear()),
                })}
          </button>
        </div>
      )}
      {leagueHasRealPlayers(league) ? null : (
        <div className="sports-card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">{t("loadRealNote")}</p>
          <button
            type="button"
            className="gm-nav__link is-active"
            disabled={seeding}
            onClick={() =>
              void newLeague(
                league.userTeamId,
                canonicalSeasonFromStartYear(currentNbaStartYear()),
                { replace: true }
              )
            }
          >
            {seeding ? t("loadingRosters") : t("loadRealButton")}
          </button>
        </div>
      )}
      {seedError ? <p className="text-sm text-red-300">{seedError}</p> : null}
      <GmNav />
      <GmCheckpointBanner />
      <GmScoutingFocusBanner />
      <GmIncomingOfferBanner />
      <div data-motion-stack className="pb-8">
        {children}
      </div>
    </main>
  );
}

