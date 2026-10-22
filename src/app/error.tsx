"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { hardReload, useStaleClientRecovery } from "@/lib/stale-client-error";

export default function AppRouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("Errors");
  const stale = useStaleClientRecovery(error);
  useEffect(() => {
    console.error("[app-route] render failed", error);
  }, [error]);

  // Isolate OOM mid-stream often succeeds on a fresh Worker. One guarded reload
  // for the homepage recovers without making the user click Retry.
  useEffect(() => {
    if (stale) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/") return;
    try {
      const key = "drbl:home-oom-retry";
      const at = Number(sessionStorage.getItem(key) || 0);
      if (Number.isFinite(at) && Date.now() - at < 30_000) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      return;
    }
    hardReload();
  }, [stale]);

  return (
    <main data-motion-static className="site-shell flex min-h-[60vh] flex-1 items-center py-8">
      <section className="w-full rounded-lg border border-border bg-background/70 p-5 shadow-sm sm:p-7">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("pageInterrupted")}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {t("couldNotLoad")}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          {t("loadHint")}
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            {t("reference", { digest: error.digest })}
          </p>
        ) : null}
        <div data-motion-list className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={stale ? hardReload : retry}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 text-[13px] font-semibold text-background"
          >
            {t("retryPage")}
          </button>
          <Link
            href="/"
            className="rounded-md border border-border px-4 py-2 text-[13px] font-semibold hover:bg-muted"
          >
            {t("goHome")}
          </Link>
        </div>
      </section>
    </main>
  );
}
