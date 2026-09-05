"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type PlayerPageSection = {
  id: string;
  label: string;
};

const DEFAULT_SECTIONS: PlayerPageSection[] = [
  { id: "overview", label: "Overview" },
  { id: "career", label: "Career" },
  { id: "seasons", label: "Seasons" },
  { id: "context", label: "Context" },
  { id: "games", label: "Games" },
  { id: "ask", label: "Ask" },
];

/**
 * Lightweight in-page nav for the unified career explorer.
 * Four primary stops + Ask — not a tabbed dashboard.
 */
export function PlayerPageNav({
  sections = DEFAULT_SECTIONS,
}: {
  sections?: PlayerPageSection[];
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
    <nav
      aria-label="Player page sections"
      className="sticky top-0 z-20 -mx-1 min-w-0 border-b border-border/80 bg-background/90 px-1 py-2 backdrop-blur-md"
    >
      <ul className="flex gap-1 touch-scroll-x pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
