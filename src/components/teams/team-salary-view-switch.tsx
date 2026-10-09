"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition, type ReactNode } from "react";

import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { type } from "@/lib/design-system";
import type { TeamSalaryView } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

export type TeamSalaryViewItem = {
  id: TeamSalaryView;
  label: string;
  href: string;
  loadingLabel: string;
};

/**
 * Salary & Assets subviews. Each view is a full server render that can take a few seconds cold,
 * so the clicked pill turns active and its skeleton replaces the old view at once.
 */
export function TeamSalaryViewSwitch({
  items,
  active,
  note,
  children,
}: {
  items: TeamSalaryViewItem[];
  active: TeamSalaryView;
  note?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(active);
  const switching = pending && shown !== active;
  const loadingLabel = items.find((item) => item.id === shown)?.loadingLabel;

  return (
    <>
      <div className="flex flex-col gap-2">
        <nav className="flex flex-wrap gap-1.5" aria-label="Salary and assets views">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              prefetch={item.id !== active}
              scroll={false}
              aria-current={shown === item.id ? "page" : undefined}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                if (item.id === shown) return;
                startTransition(() => {
                  setShown(item.id);
                  router.push(item.href, { scroll: false });
                });
              }}
              className={cn(
                type.caption,
                "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
                shown === item.id ? "glass-pill-active" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {note}
      </div>
      {switching ? <DestinationSectionSkeleton label={loadingLabel} /> : children}
    </>
  );
}
