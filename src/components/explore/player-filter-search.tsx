"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { Input } from "@/components/ui/input";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  name: string;
  team: string;
  position: string | null;
};

function dedupeHits(rows: Hit[]): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out.slice(0, 8);
}

/**
 * Player name combobox for the explore filter bar.
 * Menu is portaled + frost sits on a sibling layer so nested toolbar glass
 * does not soften the top suggestion (headshot / name).
 */
export function PlayerFilterSearch({
  season,
  value,
  onCommit,
}: {
  season: string;
  value: string;
  onCommit: (player: string | null) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(value);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const trimmed = draft.trim();
  const showList = open && trimmed.length > 0;
  const activeHit = hits[activeIndex];

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
    if (trimmed.length < 1) {
      setHits([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (season.toUpperCase() === "ALL") {
          params.set("scope", "all");
        } else {
          params.set("season", season);
        }
        const res = await fetch(`/api/players/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const body = (await res.json()) as { results?: Hit[] };
        setHits(dedupeHits(body.results ?? []));
        setActiveIndex(0);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 80);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed, season]);

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

  function commit(next: string | null) {
    const normalized = next?.trim() || null;
    setOpen(false);
    if (normalized !== (value.trim() || null)) onCommit(normalized);
  }

  function pick(hit: Hit) {
    setDraft(hit.name);
    commit(hit.name);
  }

  const menu =
    showList && menuBox
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[80]"
            style={{
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
            }}
          >
            <div className="relative isolate overflow-hidden rounded-lg border border-white/58 shadow-[inset_0_1px_0_rgb(255_255_255_/_70%),0_8px_24px_rgb(0_0_0_/_8%)] dark:border-white/16 dark:shadow-[inset_0_1px_0_rgb(255_255_255_/_12%),0_12px_32px_rgb(0_0_0_/_36%)]">
              {/* Frost layer only — keeps list text/headshots crisp. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0 bg-white/42 backdrop-blur-xl dark:bg-[rgb(28_28_30_/_0.55)]"
              />
              <ul
                id={listId}
                role="listbox"
                aria-label="Player suggestions"
                className="relative z-[1] max-h-72 overflow-auto py-1"
              >
                {loading && hits.length === 0 ? (
                  <li
                    className={cn(
                      "px-2.5 py-2 text-muted-foreground",
                      type.caption
                    )}
                  >
                    Searching…
                  </li>
                ) : null}
                {!loading && hits.length === 0 ? (
                  <li
                    className={cn(
                      "px-2.5 py-2 text-muted-foreground",
                      type.caption
                    )}
                  >
                    No matching players
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
                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
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
                        teamKey={hit.team}
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
                        <span
                          className={cn(
                            "block truncate text-muted-foreground",
                            type.caption
                          )}
                        >
                          {[hit.team, hit.position]
                            .filter(Boolean)
                            .join(" · ") || "Player"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <Input
        id="filter-player"
        name="player"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && activeHit ? `${listId}-option-${activeHit.id}` : undefined
        }
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => {
          if (trimmed || hits.length > 0) setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (rootRef.current?.contains(document.activeElement)) return;
            if (menuRef.current?.contains(document.activeElement)) return;
            commit(draft);
          }, 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (showList && activeHit) pick(activeHit);
            else commit(draft);
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
        placeholder="Search player"
        aria-label="Search player"
        autoComplete="off"
        className="h-7 border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      {menu}
    </div>
  );
}
