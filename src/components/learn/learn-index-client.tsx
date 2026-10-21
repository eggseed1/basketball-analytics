"use client";

import { TransitionLink } from "@/components/continuity/query-nav";
import { useMemo, useState } from "react";

import {
  LEARN_CATEGORIES,
  searchLearnConcepts,
  type LearnCategoryId,
  type LearnConcept,
} from "@/content/learn/registry";
import { ChoiceChip, ChoiceTrack, searchFieldClassName } from "@/components/ui/choice-chip";
import { FilterBar } from "@/components/explore/filter-bar";
import { Input } from "@/components/ui/input";
import { LinkCue } from "@/components/ui/link-cue";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export type LearnIndexConcept = LearnConcept & { href: string | null };

export function LearnIndexClient({
  concepts,
}: {
  concepts: LearnIndexConcept[];
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<LearnCategoryId | "all">("all");

  const filtered = useMemo(() => {
    const ids = q.trim()
      ? new Set(searchLearnConcepts(q).map((c) => c.id))
      : null;
    return concepts.filter((c) => {
      if (ids && !ids.has(c.id)) return false;
      return cat === "all" || c.category === cat;
    });
  }, [concepts, q, cat]);

  const byCat = useMemo(() => {
    const map = new Map<LearnCategoryId, LearnIndexConcept[]>();
    for (const c of filtered) {
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    return map;
  }, [filtered]);

  return (
    <div data-motion-stack data-motion-static className="flex flex-col gap-4">
      <FilterBar label="Learn terms">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <ChoiceTrack className="w-full max-w-md">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search terms"
              className={searchFieldClassName}
              aria-label="Search terms"
            />
          </ChoiceTrack>
          <p className={cn(type.caption, "text-muted-foreground")}>
            {filtered.length} term{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
        <ChoiceTrack className="flex-wrap gap-1 p-1" role="tablist" aria-label="Learn categories">
          <CatChip active={cat === "all"} onClick={() => setCat("all")} label="All" />
          {LEARN_CATEGORIES.map((c) => (
            <CatChip
              key={c.id}
              active={cat === c.id}
              onClick={() => setCat(c.id)}
              label={c.label}
            />
          ))}
        </ChoiceTrack>
      </FilterBar>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[14px] text-muted-foreground">
          No terms match that search.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {LEARN_CATEGORIES.filter((c) => cat === "all" || cat === c.id).map(
            (meta) => {
              const items = byCat.get(meta.id) ?? [];
              if (!items.length) return null;
              return (
                <section key={meta.id} className="flex flex-col gap-2">
                  <div>
                    <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {meta.label}
                    </h2>
                    <p className="text-[12px] text-muted-foreground">
                      {meta.description}
                    </p>
                  </div>
                  {meta.guide ? (
                    <TransitionLink
                      href={meta.guide.href}
                      className="sports-card flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50"
                    >
                      <span>
                        <span className="block text-[16px] font-semibold">{meta.guide.label}</span>
                        <span className="block text-[14px] text-muted-foreground">{meta.guide.blurb}</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[14px] font-semibold text-muted-foreground">
                        Read <LinkCue />
                      </span>
                    </TransitionLink>
                  ) : null}
                  <ul className="sports-card divide-y divide-black/5 dark:divide-white/10">
                    {items.map((g) => (
                      <li key={g.id}>
                        <TermRow concept={g} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}

function TermRow({ concept: g }: { concept: LearnIndexConcept }) {
  const body = (
    <span>
      <span className="block text-[16px] font-semibold">
        {g.shortName}
        {g.label && g.label !== g.shortName ? (
          <span className="ml-2 text-[13px] font-medium text-muted-foreground">
            {g.label}
          </span>
        ) : null}
      </span>
      <span className="block text-[14px] text-muted-foreground">{g.tooltip}</span>
    </span>
  );
  if (!g.href) {
    return <div className="px-4 py-3">{body}</div>;
  }
  return (
    <TransitionLink
      href={g.href}
      className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-secondary/50"
    >
      {body}
      <span className="shrink-0 text-[14px] font-semibold text-muted-foreground">
        Learn
      </span>
    </TransitionLink>
  );
}

function CatChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <ChoiceChip
      active={active}
      onClick={onClick}
      role="tab"
      aria-selected={active}
    >
      {label}
    </ChoiceChip>
  );
}
