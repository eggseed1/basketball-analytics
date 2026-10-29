"use client";

import { useEffect, useState } from "react";

import {
  LoadingStatus,
  SkeletonBlock,
} from "@/components/continuity/destination-loading-frame";
import { LoadingPhrase } from "@/components/continuity/loading-phrase";
import { HotColdColumns } from "@/components/explore/hot-cold-board";
import { SectionLink } from "@/components/ui/section-link";
import type { StatDetectiveRow } from "@/data/runtime/stat-detective-windows";
import { initialLoadingPhrase } from "@/lib/loading-phrases";

type Payload = {
  season: string | null;
  risers: StatDetectiveRow[];
  fallers: StatDetectiveRow[];
  empty: boolean;
};

/**
 * Hot & Cold desk module — client fetch so detective rows stay out of first HTML.
 */
export function HomeHotColdClient() {
  const [data, setData] = useState<Payload | null | "missing">(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/home/hot-cold", { signal: ac.signal });
        if (!res.ok) throw new Error(`hot-cold ${res.status}`);
        const json = (await res.json()) as Payload;
        if (!cancelled) setData(json.empty ? "missing" : json);
      } catch {
        if (!cancelled) setData("missing");
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  if (data === "missing") return null;

  if (!data) {
    return (
      <div
        className="sports-card flex h-56 flex-col gap-3 p-4"
        aria-busy="true"
        aria-live="polite"
        aria-label={initialLoadingPhrase("explore-hot-cold")}
      >
        <LoadingStatus>
          <LoadingPhrase context="explore-hot-cold" />
        </LoadingStatus>
        <div aria-hidden className="grid flex-1 gap-2 sm:grid-cols-2">
          <SkeletonBlock className="rounded-lg" />
          <SkeletonBlock className="rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <section className="sports-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="type-title">Hot & Cold</h2>
          <p className="type-caption text-muted-foreground">
            Scoring over the last 5 games of {data.season} against each
            player&apos;s own season average. Rows read season avg → last 5.
          </p>
        </div>
        <SectionLink href="/explore/players/hot-cold" className="pt-0.5">
          Open Hot &amp; Cold
        </SectionLink>
      </div>
      <HotColdColumns risers={data.risers} fallers={data.fallers} limit={4} />
    </section>
  );
}
