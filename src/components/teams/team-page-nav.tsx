"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type TeamPageSection = {
  id: string;
  label: string;
};

const DEFAULT_SECTIONS: TeamPageSection[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "identity", label: "Identity" },
  { id: "arc", label: "Arc" },
  { id: "roster", label: "Roster" },
  { id: "games", label: "Games" },
  { id: "evidence", label: "Evidence" },
  { id: "transactions", label: "Transactions" },
  { id: "ask", label: "Ask" },
];

/**
 * Lightweight sticky in-page nav for Team Intelligence V2.
 */
export function TeamPageNav({
  sections = DEFAULT_SECTIONS,
}: {
  sections?: TeamPageSection[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "overview");

  useEffect(() => {
    const nodes = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el != null);
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target.id;
        if (top) setActive(top);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5] }
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Team page sections" className="min-w-0">
      <ul className="flex justify-end gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => {
          const isActive = active === section.id;
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(section.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  setActive(section.id);
                }}
                className={cn(
                  "glass-pill inline-flex rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  isActive
                    ? "glass-pill-active"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={isActive ? "location" : undefined}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
