"use client";

import { useCallback } from "react";
import { useReportWebVitals } from "next/web-vitals";

/**
 * Permanent lab/field web-vitals bridge (P18PERF.0).
 * Stable callback — no large client work. Reports to console in development
 * and to `window.__DRBL_WEB_VITALS__` for local capture.
 */
export function WebVitalsReporter() {
  const onReport = useCallback(
    (metric: {
      name: string;
      value: number;
      id: string;
      rating?: string;
      navigationType?: string;
    }) => {
      if (typeof window === "undefined") return;
      const entry = {
        name: metric.name,
        value: metric.value,
        id: metric.id,
        rating: metric.rating,
        navigationType: metric.navigationType,
        at: Date.now(),
        path: window.location.pathname,
      };
      const bag = ((window as unknown as { __DRBL_WEB_VITALS__?: unknown[] })
        .__DRBL_WEB_VITALS__ ??= []) as unknown[];
      bag.push(entry);
      if (process.env.NODE_ENV === "development") {
        // Attribution-friendly: name + value only (no PII).
        console.info("[web-vital]", metric.name, Math.round(metric.value), metric.rating);
      }
    },
    []
  );

  useReportWebVitals(onReport);
  return null;
}
