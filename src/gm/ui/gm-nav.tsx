"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/gm", label: "Home" },
  { href: "/gm/roster", label: "Roster" },
  { href: "/gm/lineup", label: "Coaching" },
  { href: "/gm/players", label: "Players" },
  { href: "/gm/leaders", label: "Leaders" },
  { href: "/gm/teams", label: "Teams" },
  { href: "/gm/standings", label: "Standings" },
  { href: "/gm/schedule", label: "Schedule" },
  { href: "/gm/trade", label: "Trade" },
  { href: "/gm/transactions", label: "Transactions" },
  { href: "/gm/cap", label: "Salary" },
  { href: "/gm/free-agency", label: "FA" },
  { href: "/gm/draft", label: "Draft" },
  { href: "/gm/medical", label: "Medical" },
  { href: "/gm/staff", label: "Staff" },
  { href: "/gm/offseason", label: "Offseason" },
];

export function GmNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Front office" className="gm-nav">
      {LINKS.map((link) => {
        const active =
          link.href === "/gm"
            ? pathname === "/gm"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn("gm-nav__link", active && "is-active")}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
