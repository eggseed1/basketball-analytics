"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { QueryUpdatingChrome } from "@/components/continuity/query-nav";
import { PlayerIdentity } from "@/components/players/player-identity";
import { Label } from "@/components/ui/label";
import {
  CAREER_COMPARE_KEY,
  isCareerCompareKey,
} from "@/lib/career-average-row";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  name: string;
  teamKey?: string;
  subtitle?: string;
  seasonHint?: string;
};

function dedupeHits(rows: Hit[]): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out.slice(0, 24);
}

function parseCareerSeasons(payload: unknown): string[] {
  const rows = (payload as { data?: Array<{ season?: string; gamesPlayed?: number }> })
    ?.data;
  if (!Array.isArray(rows)) return [];
  const seasons = new Set<string>();
  for (const row of rows) {
    const season = String(row?.season ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(season)) continue;
    if ((row.gamesPlayed ?? 0) <= 0) continue;
    seasons.add(season);
  }
  return [...seasons].sort((a, b) => b.localeCompare(a));
}

function PlayerSearchField({
  label,
  selectedId,
  selectedName,
  season,
  seasonOptions,
  onPick,
  onSeasonChange,
}: {
  label: string;
  selectedId?: string;
  selectedName?: string;
  season?: string;
  seasonOptions: string[];
  onPick: (hit: Hit) => void;
  onSeasonChange: (season: string) => void;
}) {
  const listId = useId();
  const inputId = useId();
  const seasonId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const trimmed = q.trim();
  const showList = open && trimmed.length > 0 && !selectedId;
  const activeHit = hits[activeIndex];
  const modeValue = isCareerCompareKey(season)
    ? CAREER_COMPARE_KEY
    : (season ?? CAREER_COMPARE_KEY);

  useLayoutEffect(() => {
    if (!showList || !rootRef.current) {
      setMenuBox(null);
      return;
    }
    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuBox({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 16 * 16),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showList, hits.length, trimmed]);

  useEffect(() => {
    if (trimmed.length < 1 || selectedId) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/players/search?q=${encodeURIComponent(trimmed)}&scope=all`,
          { signal: ctrl.signal }
        );
        if (!res.ok) throw new Error("search failed");
        const body = (await res.json()) as {
          results?: Array<{
            id: string;
            name: string;
            team?: string;
            careerSpan?: string;
            season?: string;
            position?: string | null;
            draftProspect?: boolean;
            current?: boolean;
          }>;
        };
        setHits(
          dedupeHits(
            (body.results ?? []).map((row) => {
              const spanEnd = row.careerSpan?.match(/(\d{4}-\d{2})\s*$/)?.[1];
              return {
                id: row.id,
                name: row.name,
                teamKey: row.team || undefined,
                seasonHint: row.season || spanEnd,
                subtitle: [
                  row.current ? "Active" : null,
                  row.team,
                  row.position,
                  row.draftProspect
                    ? row.careerSpan
                    : row.careerSpan || row.season,
                ]
                  .filter(Boolean)
                  .join(" · "),
              };
            })
          )
        );
        setActiveIndex(0);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 80);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed, selectedId]);

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

  function pick(hit: Hit) {
    onPick(hit);
    setOpen(false);
    setQ("");
    setHits([]);
  }

  const menu =
    showList && menuBox
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[var(--z-command)]"
            style={{
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
            }}
          >
            <GlassSurface backdropBlur={24} style={{ maxHeight: "18rem" }}>
              <ul
                id={listId}
                role="listbox"
                aria-label={`${label} suggestions`}
                className="relative z-[1] max-h-72 overflow-auto py-1"
              >
                {loading && hits.length === 0 ? (
                  <li
                    className={cn(
                      "px-3 py-2 text-muted-foreground",
                      type.caption
                    )}
                  >
                    Searching…
                  </li>
                ) : null}
                {!loading && hits.length === 0 ? (
                  <li
                    className={cn(
                      "px-3 py-2 text-muted-foreground",
                      type.caption
                    )}
                  >
                    No matching players in the career search index — try last
                    name, first+last, or initials (e.g. SGA). Active and retired
                    players are both searchable.
                  </li>
                ) : null}
                {hits.map((hit, index) => (
                  <li key={hit.id} role="presentation">
                    <button
                      type="button"
                      id={`${listId}-option-${hit.id}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left",
                        index === activeIndex
                          ? "bg-foreground/8 text-foreground"
                          : "hover:bg-foreground/6"
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(hit)}
                    >
                      <PlayerHeadshot
                        playerId={hit.id}
                        name={hit.name}
                        teamKey={hit.teamKey}
                        size="xs"
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate font-semibold",
                            type.bodySm
                          )}
                        >
                          {hit.name}
                        </span>
                        {hit.subtitle ? (
                          <span
                            className={cn(
                              "block truncate text-muted-foreground",
                              type.caption
                            )}
                          >
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </GlassSurface>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <Label htmlFor={selectedId ? seasonId : inputId}>{label}</Label>
      {selectedId && selectedName ? (
        <div className="flex flex-col gap-1.5">
          <div className="site-search-field flex min-w-0 items-center gap-2 rounded-md px-3 py-2">
            <PlayerIdentity
              playerId={selectedId}
              name={selectedName}
              teamKey={undefined}
              variant="compact"
              className="min-w-0 flex-1"
              nameClassName={cn(type.bodySm, "font-semibold no-underline hover:underline")}
            />
            <button
              type="button"
              className={cn(
                type.caption,
                "shrink-0 font-semibold text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                setQ("");
                onPick({ id: "", name: "" });
              }}
            >
              Clear
            </button>
          </div>
          <div className="site-search-field flex min-w-0 items-center gap-2 rounded-md px-3 py-2">
            <label
              htmlFor={seasonId}
              className={cn(
                type.caption,
                "shrink-0 font-semibold text-muted-foreground"
              )}
            >
              Basis
            </label>
            <select
              id={seasonId}
              value={modeValue}
              onChange={(e) => onSeasonChange(e.target.value)}
              className={cn(
                type.bodySm,
                "min-w-0 flex-1 bg-transparent font-semibold outline-none"
              )}
              aria-label={`${label} career or season`}
            >
              <option value={CAREER_COMPARE_KEY}>Career average</option>
              {seasonOptions.map((s) => (
                <option key={s} value={s}>
                  {s} season
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="site-search-field flex min-w-0 items-center gap-2 rounded-md px-3 py-2">
          <Search
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            id={inputId}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              showList && activeHit
                ? `${listId}-option-${activeHit.id}`
                : undefined
            }
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
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
              if (event.key === "Enter") {
                event.preventDefault();
                if (showList && activeHit) pick(activeHit);
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
            placeholder="Any player — active or retired"
            aria-label={label}
            autoComplete="off"
            className={cn(
              type.bodySm,
              "min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            )}
          />
        </div>
      )}
      {menu}
    </div>
  );
}

export function ComparePicker({
  aId,
  bId,
  aName,
  bName,
  seasonA,
  seasonB,
}: {
  aId?: string;
  bId?: string;
  aName?: string;
  bName?: string;
  seasonA?: string;
  seasonB?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [a, setA] = useState<Hit | null>(
    aId && aName ? { id: aId, name: aName } : null
  );
  const [b, setB] = useState<Hit | null>(
    bId && bName ? { id: bId, name: bName } : null
  );
  const [sa, setSa] = useState(seasonA ?? CAREER_COMPARE_KEY);
  const [sb, setSb] = useState(seasonB ?? CAREER_COMPARE_KEY);
  const [aSeasons, setASeasons] = useState<string[]>([]);
  const [bSeasons, setBSeasons] = useState<string[]>([]);

  useEffect(() => {
    setA(aId && aName ? { id: aId, name: aName } : null);
  }, [aId, aName]);

  useEffect(() => {
    setB(bId && bName ? { id: bId, name: bName } : null);
  }, [bId, bName]);

  useEffect(() => {
    if (seasonA) setSa(seasonA);
  }, [seasonA]);

  useEffect(() => {
    if (seasonB) setSb(seasonB);
  }, [seasonB]);

  useEffect(() => {
    if (!a?.id) {
      setASeasons([]);
      return;
    }
    const ctrl = new AbortController();
    void fetch(`/api/players/${encodeURIComponent(a.id)}/seasons`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        setASeasons(parseCareerSeasons(body));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [a?.id]);

  useEffect(() => {
    if (!b?.id) {
      setBSeasons([]);
      return;
    }
    const ctrl = new AbortController();
    void fetch(`/api/players/${encodeURIComponent(b.id)}/seasons`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        setBSeasons(parseCareerSeasons(body));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [b?.id]);

  const push = (
    nextA: Hit | null,
    nextB: Hit | null,
    nextSa: string,
    nextSb: string
  ) => {
    const sp = new URLSearchParams();
    if (nextA?.id) {
      sp.set("a", nextA.id);
      if (nextA.name) sp.set("an", nextA.name);
    }
    if (nextB?.id) {
      sp.set("b", nextB.id);
      if (nextB.name) sp.set("bn", nextB.name);
    }
    if (nextSa) sp.set("seasonA", nextSa);
    if (nextSb) sp.set("seasonB", nextSb);
    if (
      nextSa &&
      nextSa === nextSb &&
      !isCareerCompareKey(nextSa)
    ) {
      sp.set("season", nextSa);
    }
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `/compare?${qs}` : "/compare", { scroll: false });
    });
  };

  return (
    <form
      className={cn(
        "relative grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2",
        pending && "opacity-70"
      )}
      data-updating={pending ? "true" : "false"}
      onSubmit={(e) => e.preventDefault()}
    >
      <QueryUpdatingChrome pending={pending} />
      <PlayerSearchField
        label="Player A"
        selectedId={a?.id || undefined}
        selectedName={a?.name || undefined}
        season={sa || undefined}
        seasonOptions={aSeasons}
        onPick={(hit) => {
          const next = hit.id ? hit : null;
          setA(next);
          const nextSa = next ? CAREER_COMPARE_KEY : "";
          setSa(nextSa);
          push(next, b, nextSa, sb);
        }}
        onSeasonChange={(next) => {
          setSa(next);
          push(a, b, next, sb);
        }}
      />
      <PlayerSearchField
        label="Player B"
        selectedId={b?.id || undefined}
        selectedName={b?.name || undefined}
        season={sb || undefined}
        seasonOptions={bSeasons}
        onPick={(hit) => {
          const next = hit.id ? hit : null;
          setB(next);
          const nextSb = next ? CAREER_COMPARE_KEY : "";
          setSb(nextSb);
          push(a, next, sa, nextSb);
        }}
        onSeasonChange={(next) => {
          setSb(next);
          push(a, b, sa, next);
        }}
      />
    </form>
  );
}
