"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Search, X } from "lucide-react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerIdentity } from "@/components/players/player-identity";
import { TeamIdentity } from "@/components/teams/team-identity";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { TEAM_BRANDS } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ba-watchlist-v1";

export type WatchlistItem = {
  id: string;
  name: string;
  kind: "player" | "team";
  teamKey?: string;
};

type SearchHit = {
  id: string;
  name: string;
  kind: "player" | "team";
  teamKey?: string;
  subtitle?: string;
};

function readWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistItem[];
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function writeWatchlist(items: WatchlistItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 12)));
}

function itemKey(item: Pick<WatchlistItem, "kind" | "id">) {
  return `${item.kind}:${item.id}`;
}

const ALL_TEAMS: SearchHit[] = Object.values(TEAM_BRANDS)
  .map((b) => {
    const meta = ESPN_TEAM_META[b.espnTeamId];
    const city = meta?.city ?? b.abbr;
    return {
      id: b.espnTeamId,
      name: city.includes(b.abbr) ? city : `${city} (${b.abbr})`,
      kind: "team" as const,
      teamKey: b.id,
      subtitle: b.abbr,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** Local favorites - players or teams, with add modal. */
export function WatchlistPanel() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setItems(readWatchlist());
    setReady(true);
  }, []);

  const remove = (item: WatchlistItem) => {
    setItems((prev) => {
      const next = prev.filter(
        (i) => !(i.kind === item.kind && i.id === item.id)
      );
      writeWatchlist(next);
      return next;
    });
  };

  const add = (hit: SearchHit) => {
    const nextItem: WatchlistItem = {
      id: hit.id,
      name: hit.name,
      kind: hit.kind,
      teamKey: hit.teamKey,
    };
    setItems((prev) => {
      const next = [
        nextItem,
        ...prev.filter((i) => !(i.kind === hit.kind && i.id === hit.id)),
      ].slice(0, 12);
      writeWatchlist(next);
      return next;
    });
  };

  const watched = useMemo(
    () => new Set(items.map((i) => itemKey(i))),
    [items]
  );

  return (
    <section className="sports-card flex min-h-[220px] flex-col gap-3 p-4 sm:p-[21px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-heading">Watchlist</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-[12px] font-semibold"
        >
          <Plus className="size-3.5" aria-hidden />
          Add
        </button>
      </div>

      {!ready ? (
        <div className="type-body-sm flex flex-1 items-center justify-center text-muted-foreground">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-black/10 px-4 py-10 text-center transition-colors hover:bg-secondary/40"
        >
          <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-foreground">
            <Plus className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[14px] font-semibold">
              Add favorite players or team
            </p>
            <p className="text-[12px] text-muted-foreground">
              Search the league and pin names to your home desk.
            </p>
          </div>
        </button>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={itemKey(item)}
              className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2"
            >
              {item.kind === "player" ? (
                <PlayerIdentity
                  playerId={item.id}
                  name={item.name}
                  teamKey={item.teamKey}
                  variant="compact"
                  className="min-w-0 flex-1"
                  nameClassName="w-full gap-2"
                >
                  <span className="relative inline-flex shrink-0">
                    <PlayerHeadshot
                      playerId={item.id}
                      name={item.name}
                      teamKey={item.teamKey}
                      size="xs"
                    />
                    {item.teamKey ? (
                      <span className="absolute -right-1 -bottom-1 rounded-full bg-background p-px ring-1 ring-border">
                        <TeamLogo teamKey={item.teamKey} size="2xs" />
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[16px] font-semibold underline decoration-foreground/40 underline-offset-2">
                    {item.name}
                  </span>
                </PlayerIdentity>
              ) : (
                <TeamIdentity
                  teamKey={item.teamKey ?? item.id}
                  label={item.name}
                  className="min-w-0 flex-1"
                  nameClassName="w-full gap-2"
                >
                  <TeamLogo teamKey={item.teamKey ?? item.id} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-[16px] font-semibold underline decoration-foreground/40 underline-offset-2">
                    {item.name}
                  </span>
                </TeamIdentity>
              )}
              <button
                type="button"
                onClick={() => remove(item)}
                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Remove ${item.name}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[12px] font-semibold text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
            >
              <Plus className="size-3.5" aria-hidden />
              Add more
            </button>
          </li>
        </ul>
      )}

      <WatchlistAddModal
        open={open}
        onClose={() => setOpen(false)}
        watched={watched}
        onAdd={add}
        onRemove={(hit) =>
          remove({
            id: hit.id,
            name: hit.name,
            kind: hit.kind,
            teamKey: hit.teamKey,
          })
        }
      />
    </section>
  );
}

function WatchlistAddModal({
  open,
  onClose,
  watched,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  watched: Set<string>;
  onAdd: (hit: SearchHit) => void;
  onRemove: (hit: SearchHit) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState<"player" | "team">("player");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
      setQuery("");
      setHits([]);
      setError(null);
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  const runSearch = useEffectEvent(async (q: string, kind: "player" | "team") => {
    if (kind === "team") {
      const needle = q.trim().toLowerCase();
      setHits(
        !needle
          ? ALL_TEAMS
          : ALL_TEAMS.filter(
              (t) =>
                t.name.toLowerCase().includes(needle) ||
                (t.subtitle ?? "").toLowerCase().includes(needle) ||
                (t.teamKey ?? "").includes(needle)
            )
      );
      setLoading(false);
      setError(null);
      return;
    }

    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q.trim())}&kind=player`
      );
      if (!res.ok) throw new Error("Search failed");
      const json = (await res.json()) as { data?: SearchHit[] };
      setHits(json.data ?? []);
    } catch {
      setHits([]);
      setError("Could not search right now. Try again.");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      void runSearch(query, tab);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [open, query, tab]);

  const onDialogClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onDialogClose}
      aria-labelledby={titleId}
      className={cn(
        "fixed top-1/2 left-1/2 z-50 w-[min(100%-1.5rem,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-background p-0 shadow-xl",
        "backdrop:bg-black/40",
        "open:flex open:flex-col"
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 id={titleId} className="text-[16px] font-bold tracking-tight">
            Add to watchlist
          </h3>
          <p className="text-[12px] text-muted-foreground">
            Search players or pick a team.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex gap-1">
          {(
            [
              ["player", "Players"],
              ["team", "Teams"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors",
                tab === id
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="relative block">
          <span className="sr-only">Search</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "player" ? "Search players…" : "Filter teams…"
            }
            className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            autoFocus
          />
        </label>

        <div className="max-h-[min(50vh,22rem)] overflow-y-auto rounded-md border border-border">
          {loading ? (
            <p className="px-3 py-8 text-center text-[14px] text-muted-foreground">
              Searching…
            </p>
          ) : error ? (
            <p className="px-3 py-8 text-center text-[14px] text-muted-foreground">
              {error}
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-8 text-center text-[14px] text-muted-foreground">
              {tab === "player" && query.trim().length < 2
                ? "Type at least 2 letters to search players."
                : "No matches."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {hits.map((hit) => {
                const key = itemKey(hit);
                const onList = watched.has(key);
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2 px-3 py-2.5"
                  >
                    {hit.kind === "player" ? (
                      <span className="relative inline-flex shrink-0">
                        <PlayerHeadshot
                          playerId={hit.id}
                          name={hit.name}
                          teamKey={hit.teamKey}
                          size="xs"
                        />
                        {hit.teamKey ? (
                          <span className="absolute -right-1 -bottom-1 rounded-full bg-background p-px ring-1 ring-border">
                            <TeamLogo teamKey={hit.teamKey} size="2xs" />
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <TeamLogo teamKey={hit.teamKey ?? hit.id} size="xs" />
                    )}
                    <div className="min-w-0 flex-1">
                      {hit.kind === "player" ? (
                        <PlayerIdentity
                          playerId={hit.id}
                          name={hit.name}
                          teamKey={hit.teamKey}
                          variant="compact"
                          className="block min-w-0"
                          nameClassName="inline"
                        >
                          <span className="block truncate text-[16px] font-semibold underline decoration-foreground/40 underline-offset-2">
                            {hit.name}
                          </span>
                        </PlayerIdentity>
                      ) : (
                        <TeamIdentity
                          teamKey={hit.teamKey ?? hit.id}
                          label={hit.name}
                          className="block min-w-0"
                          nameClassName="inline"
                        >
                          <span className="block truncate text-[16px] font-semibold underline decoration-foreground/40 underline-offset-2">
                            {hit.name}
                          </span>
                        </TeamIdentity>
                      )}
                      <p className="truncate text-[12px] text-muted-foreground">
                        {hit.subtitle ??
                          (hit.kind === "player" ? "Player" : "Team")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => (onList ? onRemove(hit) : onAdd(hit))}
                      className={cn(
                        "shrink-0 rounded-md px-2.5 py-1 text-[12px] font-semibold",
                        onList
                          ? "bg-secondary text-muted-foreground hover:text-foreground"
                          : "bg-foreground text-background"
                      )}
                    >
                      {onList ? "Remove" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function addToWatchlist(item: WatchlistItem) {
  if (typeof window === "undefined") return;
  const cur = readWatchlist().filter(
    (i) => !(i.kind === item.kind && i.id === item.id)
  );
  writeWatchlist([item, ...cur]);
}
