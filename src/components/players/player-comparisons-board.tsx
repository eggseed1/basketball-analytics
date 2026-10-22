"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { GlassSurface } from "@/components/brand/glass-surface";
import { PlayerCompFuturesPanel } from "@/components/players/player-comp-futures-panel";
import {
  PlayerRoleAffinity,
  PlayerRoleMixStack,
} from "@/components/players/player-role-affinity";
import { PlayerSimilarClient } from "@/components/players/player-similar-client";
import { PlayerStyleDietAxis } from "@/components/players/player-style-diet-axis";
import { usePlayerViewSeason } from "@/components/players/player-view-season";
import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import { TextLink } from "@/components/ui/text-link";
import { SectionFrame } from "@/components/layout/section-frame";
import type { PlayerSeason } from "@/data/types";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  seedCompFuturesBundle,
  warmComparisonsFetches,
} from "@/lib/player-comparisons-fetch";
import type { CompFuturesBundle } from "@/lib/player-comp-futures-shared";
import {
  assignPlayerRole,
  playerRoleDietLabel,
  playerRoleShellLabel,
  type PlayerRoleAssignment,
  type PlayerRoleMixEntry,
} from "@/lib/player-role";
import { dietContinuumPosition } from "@/lib/player-style-story";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type CompTab = "style" | "impact" | "trajectory";

const TABS: Array<{ id: CompTab; label: string }> = [
  { id: "style", label: "Style" },
  { id: "impact", label: "Impact" },
  { id: "trajectory", label: "Trajectory" },
];

/**
 * Overview Comparisons: entry motion and Impact / Trajectory warm wait until
 * the section is near the viewport. Tab flips animate on the pane.
 */
export function PlayerComparisonsBoard({
  playerId,
  season,
  career: careerProp,
  espnId,
  teamKey,
  position,
  trajectoryBundle = null,
}: {
  playerId: string;
  season: string;
  /**
   * Optional SSR career. Prefer omitting on overview — the board loads
   * `/api/players/.../seasons` so the RSC payload stays small.
   */
  career?: PlayerSeason[] | null;
  espnId?: string | null;
  teamKey?: string | null;
  position?: string | null;
  /** Optional SSR Trajectory seed. Prefer omitting; client warms on scroll. */
  trajectoryBundle?: CompFuturesBundle | null;
}) {
  const t = useTranslations("PlayerDetail");
  const viewSeason = usePlayerViewSeason(season);
  const focalCompareId = espnId || playerId;
  const seededTrajectory = useRef(false);
  const [fetchedCareer, setFetchedCareer] = useState<PlayerSeason[] | null>(
    null
  );

  useEffect(() => {
    if (careerProp && careerProp.length > 0) {
      setFetchedCareer(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/players/${encodeURIComponent(playerId)}/seasons`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`seasons ${res.status}`);
        return res.json() as Promise<{ data?: PlayerSeason[] }>;
      })
      .then((json) => {
        if (cancelled) return;
        setFetchedCareer(Array.isArray(json.data) ? json.data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setFetchedCareer([]);
      });
    return () => {
      cancelled = true;
    };
  }, [careerProp, playerId]);

  const career = careerProp?.length ? careerProp : (fetchedCareer ?? []);

  const seasonRow = useMemo(() => {
    return (
      career.find(
        (row) =>
          row.season === viewSeason &&
          (row.gamesPlayed > 0 || row.usagePct != null)
      ) ??
      career.find((row) => row.season === viewSeason) ??
      null
    );
  }, [career, viewSeason]);

  const role = useMemo(() => {
    if (!seasonRow) return null;
    const next = assignPlayerRole({
      row: seasonRow,
      zones: null,
      position: position ?? seasonRow.position,
    });
    if (!next || next.id === "unclear") return null;
    return next;
  }, [position, seasonRow]);

  const wash = useMemo(() => {
    const key = seasonRow?.teamId ?? teamKey;
    const brand = resolveTeamBrand(key);
    return brandAtmosphereColors(brand?.primary, brand?.secondary);
  }, [seasonRow?.teamId, teamKey]);

  const defaultTab: CompTab = role
    ? "style"
    : seasonRow
      ? "trajectory"
      : "impact";
  const [tab, setTab] = useState<CompTab>(defaultTab);
  const [animateSwap, setAnimateSwap] = useState(false);
  const seasonSeen = useRef(viewSeason);

  useEffect(() => {
    if (seasonSeen.current === viewSeason) return;
    seasonSeen.current = viewSeason;
    setAnimateSwap(true);
  }, [viewSeason]);

  useEffect(() => {
    let skipTrajectory = false;
    if (trajectoryBundle && viewSeason === season && !seededTrajectory.current) {
      seedCompFuturesBundle(
        { playerId, season: viewSeason, espnId },
        trajectoryBundle
      );
      seededTrajectory.current = true;
      skipTrajectory = true;
    }

    const target = document.getElementById("comparisons");
    const warm = () => {
      warmComparisonsFetches({
        playerId,
        season: viewSeason,
        espnId,
        skipTrajectory,
      });
    };

    // Warm when the section is near the fold — not on first paint above it.
    if (!target) {
      warm();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        warm();
        io.disconnect();
      },
      { rootMargin: "240px 0px", threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [espnId, playerId, season, trajectoryBundle, viewSeason]);

  const compareHref = `/compare?a=${encodeURIComponent(focalCompareId)}&season=${encodeURIComponent(viewSeason)}`;
  const paneTeamKey = seasonRow?.teamId ?? teamKey ?? null;
  const careerLoading = !careerProp?.length && fetchedCareer === null;

  const selectTab = (next: CompTab) => {
    if (next === tab) return;
    setAnimateSwap(true);
    setTab(next);
  };

  return (
    <SectionFrame
      id="comparisons"
      density="overview"
      holdUntilScroll
      title={t("comparisonsTitle")}
      description={`${t("comparisonsHint")} · ${viewSeason}`}
    >
      <div data-motion-tabs="pills" className="flex flex-col gap-3">
        <ChoiceTrack
          className="w-fit max-w-full"
          scrollable
          role="tablist"
          aria-label={t("comparisonsTitle")}
        >
          {TABS.map((item) => (
            <ChoiceChip
              key={item.id}
              active={tab === item.id}
              onClick={() => selectTab(item.id)}
              role="tab"
              aria-controls="comparisons-pane"
              id={`comparisons-tab-${item.id}`}
              data-motion="chip"
            >
              {item.label}
            </ChoiceChip>
          ))}
        </ChoiceTrack>

        <div
          id="comparisons-pane"
          role="tabpanel"
          aria-labelledby={`comparisons-tab-${tab}`}
          key={`${tab}-${viewSeason}`}
          data-comparisons-pane={animateSwap ? "swap" : "ready"}
          className="flex min-h-[8rem] flex-col gap-3"
        >
          {careerLoading ? (
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              Loading comparisons…
            </p>
          ) : null}

          {!careerLoading && tab === "style" ? (
            <StylePane
              role={role}
              seasonRow={seasonRow}
              season={viewSeason}
              accent={wash?.colorA}
              accentB={wash?.colorB}
            />
          ) : null}

          {!careerLoading && tab === "impact" ? (
            <PlayerSimilarClient
              playerId={playerId}
              season={viewSeason}
              espnId={espnId}
              focalCompareId={focalCompareId}
              compareHref={compareHref}
            />
          ) : null}

          {!careerLoading && tab === "trajectory" ? (
            <PlayerCompFuturesPanel
              playerId={playerId}
              season={viewSeason}
              focal={seasonRow}
              teamKey={paneTeamKey}
              espnId={espnId}
              initialBundle={
                viewSeason === season ? trajectoryBundle : null
              }
              embedded
            />
          ) : null}
        </div>
      </div>
    </SectionFrame>
  );
}

function StylePane({
  role,
  seasonRow,
  season,
  accent,
  accentB,
}: {
  role: PlayerRoleAssignment | null;
  seasonRow: PlayerSeason | null;
  season: string;
  accent?: string;
  accentB?: string;
}) {
  if (!role) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No clear style for {season} yet. Needs enough minutes with usage and
        assist rates on file.
      </p>
    );
  }

  const mix = role.roleMix.slice(0, 4) as PlayerRoleMixEntry[];
  const hasNeighbors = mix.length >= 2;
  const dietPosition = dietContinuumPosition(
    role.diet,
    seasonRow?.threePointAttemptRate
  );
  const stylesHref = `/explore/players/styles?season=${encodeURIComponent(role.season)}&style=${encodeURIComponent(role.id)}`;
  const allStylesHref = `/explore/players/styles?season=${encodeURIComponent(role.season)}`;
  const fitPct = Math.round(role.confidence * 100);

  return (
    <GlassSurface
      effect="css"
      variant="subtle"
      accentColor={accent}
      accentColorB={accentB}
      className="flex flex-col gap-4 p-4 sm:p-5"
      data-motion="card"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <p
              className={cn(type.heading, "tracking-tight")}
              style={accent ? { color: accent } : undefined}
            >
              {role.phrase}
            </p>
            <p className={cn(type.bodySm, "mt-1 max-w-xl text-muted-foreground")}>
              {role.blurb}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <StyleChip strong accent={accent}>
                {playerRoleShellLabel(role.shell)}
              </StyleChip>
              <StyleChip accent={accentB ?? accent}>
                {playerRoleDietLabel(role.diet)}
              </StyleChip>
              {role.defenseLabel ? (
                <StyleChip>{role.defenseLabel}</StyleChip>
              ) : null}
            </div>
          </div>
          <div
            className="flex shrink-0 flex-col items-start gap-0.5 sm:items-end"
            data-motion-tile
          >
            <p
              className={cn(type.title, "font-bold tabular-nums tracking-tight")}
              style={accent ? { color: accent } : undefined}
            >
              {fitPct}%
            </p>
            <p className={cn(type.caption, "text-muted-foreground")}>fit</p>
          </div>
        </div>

        {hasNeighbors ? (
          <PlayerRoleMixStack mix={mix} accent={accent} accentB={accentB} />
        ) : null}

        <div
          className={cn(
            "grid gap-5 sm:gap-6",
            hasNeighbors && "sm:grid-cols-2"
          )}
        >
          <PlayerStyleDietAxis
            position={dietPosition}
            label={role.dietLine || playerRoleDietLabel(role.diet)}
            accent={accent}
            accentB={accentB}
          />
          {hasNeighbors ? (
            <div className="min-w-0">
              <p
                className={cn(type.caption, "mb-2 font-semibold text-foreground")}
              >
                Closest styles · {season}
              </p>
              <PlayerRoleAffinity
                mix={mix}
                activeId={role.id}
                accent={accent}
                accentB={accentB}
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/40 pt-3">
          <TextLink href={stylesHref} className={cn(type.caption, "font-semibold")}>
            Other {role.phrase.toLowerCase()}s
          </TextLink>
          <TextLink
            href={allStylesHref}
            className={cn(type.caption, "text-muted-foreground")}
          >
            All styles
          </TextLink>
        </div>
      </div>
    </GlassSurface>
  );
}

function StyleChip({
  children,
  strong,
  accent,
}: {
  children: ReactNode;
  strong?: boolean;
  accent?: string;
}) {
  return (
    <span
      className={cn(
        type.caption,
        "rounded-md border px-2 py-0.5",
        strong ? "font-semibold text-foreground" : "text-muted-foreground",
        !accent && "border-border/50 bg-foreground/[0.03]"
      )}
      style={
        accent
          ? {
              borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
              background: `color-mix(in oklab, ${accent} 14%, transparent)`,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}
