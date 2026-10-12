"use client";

import { useEffect, useSyncExternalStore } from "react";

import { isNewSinceLastVisit, markSeen } from "@/lib/visit-seen";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/** "New" on items this browser hasn't shown before; nothing on a first visit or on the server. */
export function NewSinceTag({ id, className }: { id: string; className?: string }) {
  const isNew = useSyncExternalStore(
    subscribe,
    () => isNewSinceLastVisit(id),
    () => false
  );
  useEffect(() => markSeen(id), [id]);
  if (!isNew) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full bg-[color-mix(in_oklab,#2f6fdb_16%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-[0.06em] text-[#2457b8] dark:text-[#8fb4ff]",
        className
      )}
    >
      New
    </span>
  );
}
