"use client";

import type { ReactNode } from "react";

import { QueryNavProvider } from "@/components/continuity/query-nav";

/** Transition chrome for Time Machine season/date/theme changes. */
export function HistoryClientShell({ children }: { children: ReactNode }) {
  return <QueryNavProvider className="gap-6">{children}</QueryNavProvider>;
}
