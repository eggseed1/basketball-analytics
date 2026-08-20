"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { QueryUpdatingChrome } from "@/components/continuity/query-nav";
import { PlayerIdentity } from "@/components/players/player-identity";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  name: string;
  teamKey?: string;
  subtitle?: string;
};

function PlayerSearchField({
  label,
  selectedId,
  selectedName,
  onPick,
}: {
  label: string;
  selectedId?: string;
  selectedName?: string;
  onPick: (hit: Hit) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const trimmed = q.trim();
  const visibleHits = trimmed.length < 2 ? [] : hits;

  useEffect(() => {
    if (trimmed.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}&kind=player`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((body) => {
          const data = (body?.data ?? []) as Hit[];
          setHits(data.slice(0, 8));
          setOpen(true);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [trimmed]);

  return (
    <div className="relative flex flex-col gap-1.5">
      <Label>{label}</Label>
      {selectedId && selectedName ? (
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
          <PlayerIdentity
            playerId={selectedId}
            name={selectedName}
            teamKey={undefined}
            variant="compact"
            className="min-w-0 flex-1"
            nameClassName="text-[14px] font-semibold no-underline hover:underline"
          />
          <button
            type="button"
            className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            onClick={() => {
              setQ("");
              onPick({ id: "", name: "" });
            }}
          >
            Clear
          </button>
        </div>
      ) : (
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => visibleHits.length && setOpen(true)}
          placeholder="Search player"
          autoComplete="off"
        />
      )}
      {open && visibleHits.length > 0 && !selectedId ? (
        <ul className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-md">
          {visibleHits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary"
                onClick={() => {
                  onPick(hit);
                  setOpen(false);
                  setQ("");
                }}
              >
                <PlayerHeadshot
                  playerId={hit.id}
                  name={hit.name}
                  teamKey={hit.teamKey}
                  size="xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">
                    {hit.name}
                  </span>
                  {hit.subtitle ? (
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {hit.subtitle}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ComparePicker({
  aId,
  bId,
  aName,
  bName,
  season,
}: {
  aId?: string;
  bId?: string;
  aName?: string;
  bName?: string;
  season?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [a, setA] = useState<Hit | null>(
    aId && aName ? { id: aId, name: aName } : null
  );
  const [b, setB] = useState<Hit | null>(
    bId && bName ? { id: bId, name: bName } : null
  );

  const push = (nextA: Hit | null, nextB: Hit | null) => {
    const sp = new URLSearchParams();
    if (nextA?.id) sp.set("a", nextA.id);
    if (nextB?.id) sp.set("b", nextB.id);
    if (season) sp.set("season", season);
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
        onPick={(hit) => {
          const next = hit.id ? hit : null;
          setA(next);
          push(next, b);
        }}
      />
      <PlayerSearchField
        label="Player B"
        selectedId={b?.id || undefined}
        selectedName={b?.name || undefined}
        onPick={(hit) => {
          const next = hit.id ? hit : null;
          setB(next);
          push(a, next);
        }}
      />
    </form>
  );
}
