"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PlayerRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[player-route] render failed", error);
  }, [error]);

  return (
    <main className="site-shell flex min-h-[60vh] flex-1 items-center py-8">
      <section className="w-full rounded-lg border border-border bg-background/70 p-5 shadow-sm sm:p-7">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Player page interrupted
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          The player data provider did not finish cleanly.
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          The route is valid. Retry the request, or return to the player board
          while the upstream data source recovers.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 text-[13px] font-semibold text-background"
          >
            Retry player page
          </button>
          <Link
            href="/explore/players"
            className="rounded-md border border-border px-4 py-2 text-[13px] font-semibold hover:bg-muted"
          >
            Back to players
          </Link>
        </div>
      </section>
    </main>
  );
}
