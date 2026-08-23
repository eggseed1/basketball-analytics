"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { useRouteTransitionOptional } from "@/components/continuity/route-transition";
import { type } from "@/lib/design-system";
import { TEAM_BRANDS } from "@/lib/nba-brand";
import { assertInternalHref } from "@/lib/navigation";
import {
  getCanonicalTeamOrUndefined,
  teamProfileHref,
} from "@/lib/team-identity";
import { cn } from "@/lib/utils";

type SiteHit = {
  id: string;
  name: string;
  kind: "player" | "team";
  teamKey?: string;
  subtitle?: string;
};

const LOCAL_TEAMS: SiteHit[] = (() => {
  const seen = new Set<string>();
  const rows: SiteHit[] = [];
  for (const brand of Object.values(TEAM_BRANDS)) {
    if (seen.has(brand.espnTeamId)) continue;
    seen.add(brand.espnTeamId);
    const canonical = getCanonicalTeamOrUndefined(brand.espnTeamId);
    rows.push({
      id: brand.espnTeamId,
      name: canonical?.displayName ?? brand.abbr,
      kind: "team",
      teamKey: brand.id,
      subtitle: brand.abbr,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
})();

function normTeamQuery(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Team match: token / abbreviation prefixes only.
 * Avoids mid-word hits like "der" inside "Thunder".
 */
function teamTextMatches(haystack: string, query: string): boolean {
  const q = normTeamQuery(query);
  if (!q) return false;
  const h = normTeamQuery(haystack);
  if (!h) return false;
  if (h === q || h.startsWith(`${q} `) || h.endsWith(` ${q}`)) return true;
  const tokens = h.split(" ").filter(Boolean);
  const parts = q.split(" ").filter(Boolean);
  return parts.every((part) => tokens.some((token) => token.startsWith(part)));
}

function matchLocalTeams(query: string): SiteHit[] {
  const needle = query.trim();
  if (!needle) return [];
  return LOCAL_TEAMS.filter((team) => {
    return (
      teamTextMatches(team.name, needle) ||
      teamTextMatches(team.subtitle ?? "", needle) ||
      teamTextMatches(team.teamKey ?? "", needle)
    );
  }).slice(0, 6);
}

function hitKey(hit: SiteHit): string {
  return `${hit.kind}:${hit.id}`;
}

function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Merge search groups in priority order.
 * Players dedupe by id AND display name so ESPN + NBA board rows for the
 * same athlete (different provider ids / stale team subtitles) collapse.
 */
function mergeHits(...groups: SiteHit[][]): SiteHit[] {
  const seenIds = new Set<string>();
  const seenPlayerNames = new Set<string>();
  const out: SiteHit[] = [];
  for (const group of groups) {
    for (const hit of group) {
      const key = hitKey(hit);
      if (seenIds.has(key)) continue;
      if (hit.kind === "player") {
        const nameKey = normalizePlayerName(hit.name);
        if (nameKey && seenPlayerNames.has(nameKey)) continue;
        if (nameKey) seenPlayerNames.add(nameKey);
      }
      seenIds.add(key);
      out.push(hit);
    }
  }
  return out.slice(0, 8);
}

function hrefForHit(hit: SiteHit): string {
  if (hit.kind === "team") {
    return assertInternalHref(teamProfileHref(hit.teamKey ?? hit.id));
  }
  return assertInternalHref(`/players/${encodeURIComponent(hit.id)}`);
}

function exploreHref(term: string): string {
  return !term
    ? assertInternalHref("/explore/players")
    : assertInternalHref(
        `/explore/players?player=${encodeURIComponent(term)}`
      );
}

export function SiteSearch() {
  const router = useRouter();
  const routeTransition = useRouteTransitionOptional();
  const pending = Boolean(routeTransition?.pending);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [q, setQ] = useState("");
  const [remoteHits, setRemoteHits] = useState<SiteHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const trimmed = q.trim();
  const localTeams = useMemo(() => matchLocalTeams(trimmed), [trimmed]);
  const hits = useMemo(
    () => mergeHits(localTeams, remoteHits),
    [localTeams, remoteHits]
  );

  useEffect(() => {
    if (trimmed.length < 1) {
      setRemoteHits([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const requests: Promise<SiteHit[]>[] = [
          fetch(
            `/api/players/search?q=${encodeURIComponent(trimmed)}&scope=all`,
            {
              signal: controller.signal,
            }
          )
            .then((res) => (res.ok ? res.json() : { results: [] }))
            .then((body: {
              results?: Array<{
                id: string;
                name: string;
                team: string;
                position: string | null;
                careerSpan?: string;
                current?: boolean;
                draftProspect?: boolean;
              }>;
            }) =>
              (body.results ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                kind: "player" as const,
                teamKey: row.team || undefined,
                subtitle: row.draftProspect
                  ? [row.team, row.careerSpan].filter(Boolean).join(" · ") ||
                    "Draft prospect"
                  : row.current
                    ? [row.team, row.position].filter(Boolean).join(" · ") ||
                      "Player"
                    : row.careerSpan
                      ? row.careerSpan
                      : [row.team, row.position].filter(Boolean).join(" · ") ||
                        "Past player",
              }))
            )
            .catch(() => [] as SiteHit[]),
        ];

        if (trimmed.length >= 2) {
          requests.push(
            fetch(`/api/search?q=${encodeURIComponent(trimmed)}&kind=all`, {
              signal: controller.signal,
            })
              .then((res) => (res.ok ? res.json() : { data: [] }))
              .then((body: { data?: SiteHit[] }) => body.data ?? [])
              .catch(() => [] as SiteHit[])
          );
        }

        const groups = await Promise.all(requests);
        setRemoteHits(mergeHits(...groups));
        setActiveIndex(0);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setRemoteHits([]);
      } finally {
        setLoading(false);
      }
    }, 160);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const showList = open && trimmed.length > 0;

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!showList) {
      setMenuBox(null);
      return;
    }
    function updateBox() {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuBox({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }
    updateBox();
    window.addEventListener("resize", updateBox);
    window.addEventListener("scroll", updateBox, true);
    return () => {
      window.removeEventListener("resize", updateBox);
      window.removeEventListener("scroll", updateBox, true);
    };
  }, [showList, hits.length]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQ("");
      setRemoteHits([]);
      const run = () => router.push(href);
      if (routeTransition) routeTransition.startRouteTransition(run);
      else run();
    },
    [router, routeTransition]
  );

  const goToHit = useCallback(
    (hit: SiteHit) => {
      go(hrefForHit(hit));
    },
    [go]
  );

  const activeHit = hits[activeIndex];

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (showList && activeHit) {
      goToHit(activeHit);
      return;
    }
    go(exploreHref(trimmed));
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md sm:flex-none lg:max-w-lg"
      data-updating={pending ? "true" : "false"}
    >
      <div ref={rootRef} className="relative min-w-0 flex-1">
        <label className="sr-only" htmlFor="site-search">
          Search players and teams
        </label>
        <div className="site-search-field flex min-w-0 items-center gap-2 rounded-md px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            id="site-search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              showList && activeHit
                ? `${listId}-option-${hitKey(activeHit)}`
                : undefined
            }
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => {
              if (trimmed || hits.length > 0) setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                return;
              }
              if (!showList || hits.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              }
            }}
            placeholder="Search players / teams"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        {showList && menuBox
          ? createPortal(
              <div
                ref={menuRef}
                className="fixed z-50"
                style={{
                  top: menuBox.top,
                  left: menuBox.left,
                  width: menuBox.width,
                }}
              >
                <GlassSurface
                  backdropBlur={24}
                  style={{ maxHeight: "18rem" }}
                >
                  <ul
                    id={listId}
                    role="listbox"
                    aria-label="Search suggestions"
                    className="max-h-72 overflow-auto py-1"
                  >
                    {loading && hits.length === 0 ? (
                      <li
                        className={cn(
                          "px-3 py-2 text-muted-foreground",
                          type.bodySm
                        )}
                      >
                        Searching…
                      </li>
                    ) : null}
                    {!loading && hits.length === 0 ? (
                      <li
                        className={cn(
                          "px-3 py-2 text-muted-foreground",
                          type.bodySm
                        )}
                      >
                        No matches. Press enter to search explore.
                      </li>
                    ) : null}
                    {hits.map((hit, index) => (
                      <li key={hitKey(hit)} role="presentation">
                        <button
                          type="button"
                          id={`${listId}-option-${hitKey(hit)}`}
                          role="option"
                          aria-selected={index === activeIndex}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left",
                            index === activeIndex
                              ? "bg-foreground/8 text-foreground"
                              : "hover:bg-foreground/6"
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => goToHit(hit)}
                        >
                          {hit.kind === "team" ? (
                            <TeamLogo teamKey={hit.teamKey ?? hit.id} size="xs" />
                          ) : (
                            <PlayerHeadshot
                              playerId={hit.id}
                              name={hit.name}
                              teamKey={hit.teamKey}
                              size="xs"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate font-semibold",
                                type.bodySm
                              )}
                            >
                              {hit.name}
                            </span>
                            <span
                              className={cn(
                                "block truncate text-muted-foreground",
                                type.caption
                              )}
                            >
                              {hit.kind === "team"
                                ? hit.subtitle ?? "Team"
                                : hit.subtitle || "Player"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </GlassSurface>
              </div>,
              document.body
            )
          : null}
      </div>
    </form>
  );
}
