"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/gm", label: "Home" },
  { href: "/gm/offseason", label: "Offseason" },
  { href: "/gm/roster", label: "Roster" },
  { href: "/gm/lineup", label: "Lineup" },
  { href: "/gm/trade", label: "Trade" },
  { href: "/gm/cap", label: "Cap" },
  { href: "/gm/standings", label: "Standings" },
  { href: "/gm/schedule", label: "Schedule" },
  { href: "/gm/draft", label: "Draft" },
  { href: "/gm/free-agency", label: "FA" },
  { href: "/gm/medical", label: "Medical" },
  { href: "/gm/staff", label: "Staff" },
];

export function GmNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Front office"
      className="flex gap-1 overflow-x-auto pb-1"
    >
      {LINKS.map((link) => {
        const active =
          link.href === "/gm"
            ? pathname === "/gm"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[14px] font-semibold transition-colors",
              active
                ? "bg-foreground text-background"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
