"use client";

import { useCallback } from "react";
import { useReportWebVitals } from "next/web-vitals";

type VitalMetric = {
  name: string;
  value: number;
  id: string;
  rating?: string;
  navigationType?: string;
};

function deviceCategory(): "phone" | "tablet" | "desktop" {
  const w = window.innerWidth;
  if (w < 768) return "phone";
  if (w < 1024) return "tablet";
  return "desktop";
}

/**
 * Lab/field web-vitals bridge. Records route, viewport class, build, and
 * navigation type. No page content or PII.
 */
export function WebVitalsReporter({ buildId }: { buildId?: string | null }) {
  const onReport = useCallback(
    (metric: VitalMetric) => {
      if (typeof window === "undefined") return;
      const entry = {
        name: metric.name,
        value: metric.value,
        id: metric.id,
        rating: metric.rating,
        navigationType: metric.navigationType,
        at: Date.now(),
        path: window.location.pathname,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        deviceCategory: deviceCategory(),
        build: buildId ?? null,
      };
      const bag = ((window as unknown as { __DRBL_WEB_VITALS__?: unknown[] })
        .__DRBL_WEB_VITALS__ ??= []) as unknown[];
      bag.push(entry);
      if (process.env.NODE_ENV === "development") {
        console.info(
          "[web-vital]",
          metric.name,
          Math.round(metric.value),
          metric.rating
        );
      }
    },
    [buildId]
  );

  useReportWebVitals(onReport);
  return null;
}
