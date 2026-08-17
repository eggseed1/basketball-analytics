"use client";

import type { ReactNode } from "react";

import { QueryNavProvider } from "@/components/continuity/query-nav";

/** Shared transition chrome for offseason filter → timeline updates. */
export function OffseasonClientShell({ children }: { children: ReactNode }) {
  return <QueryNavProvider>{children}</QueryNavProvider>;
}
