"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchHit {
  id: string;
  name: string;
  team: string;
  position: string | null;
  season: string;
}

export function GlobalPlayerSearch({
  className,
}: {
  className?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/players/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { results: SearchHit[] };
        setResults(data.results ?? []);
        setActiveIndex(0);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const goToPlayer = useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      setQuery("");
      setResults([]);
      startTransition(() => {
        router.push(`/players/${hit.id}?season=${encodeURIComponent(hit.season)}`);
      });
    },
    [router]
  );

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <label htmlFor={inputId} className="sr-only">
        Search players
      </label>
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={open && (results.length > 0 || loading)}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && results[activeIndex]
            ? `${listId}-option-${results[activeIndex].id}`
            : undefined
        }
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (query.trim() || results.length > 0) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
            if (results.length > 0) setOpen(true);
          }
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!results.length) {
            if (event.key === "Enter" && query.trim()) {
              event.preventDefault();
              router.push(
                `/explore/players?player=${encodeURIComponent(query.trim())}`
              );
              setOpen(false);
            }
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const hit = results[activeIndex];
            if (hit) goToPlayer(hit);
          }
        }}
        placeholder="Search players…"
        autoComplete="off"
        className="h-9 bg-background"
      />

      {open && query.trim() ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Player search results"
          className="absolute top-[calc(100%+0.35rem)] z-50 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover py-1 shadow-md"
        >
          {loading && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Searching…
            </li>
          ) : null}
          {!loading && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No players found.{" "}
              <Link
                href={`/explore/players?player=${encodeURIComponent(query.trim())}`}
                className="underline underline-offset-2"
                onClick={() => setOpen(false)}
              >
                Search explore
              </Link>
            </li>
          ) : null}
          {results.map((hit, index) => (
            <li key={hit.id} role="presentation">
              <button
                type="button"
                id={`${listId}-option-${hit.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                  index === activeIndex
                    ? "bg-muted text-foreground"
                    : "hover:bg-muted/70"
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => goToPlayer(hit)}
              >
                <span className="min-w-0 truncate font-medium">{hit.name}</span>
                <span className="shrink-0 font-mono text-xs uppercase text-muted-foreground">
                  {[hit.team, hit.position].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
