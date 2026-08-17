"use client";

import type { ReactNode } from "react";

import { QueryNavProvider } from "@/components/continuity/query-nav";

/** Soft query transitions for destination season chips (keeps identity mounted). */
export function DestinationClientShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <QueryNavProvider className={className}>{children}</QueryNavProvider>;
}
