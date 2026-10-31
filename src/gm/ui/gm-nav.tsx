"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/gm", labelKey: "nav_home" },
  { href: "/gm/roster", labelKey: "nav_roster" },
  { href: "/gm/lineup", labelKey: "nav_coaching" },
  { href: "/gm/players", labelKey: "nav_players" },
  { href: "/gm/awards", labelKey: "nav_awards" },
  { href: "/gm/teams", labelKey: "nav_teams" },
  { href: "/gm/standings", labelKey: "nav_standings" },
  { href: "/gm/schedule", labelKey: "nav_schedule" },
  { href: "/gm/trade", labelKey: "nav_trade" },
  { href: "/gm/transactions", labelKey: "nav_transactions" },
  { href: "/gm/cap", labelKey: "nav_salary" },
  { href: "/gm/free-agency", labelKey: "nav_fa" },
  { href: "/gm/draft", labelKey: "nav_draft" },
  { href: "/gm/medical", labelKey: "nav_medical" },
  { href: "/gm/staff", labelKey: "nav_staff" },
] as const;

export function GmNav() {
  const pathname = usePathname();
  const t = useTranslations("Gm");
  return (
    <nav aria-label={t("nav_ariaLabel")} className="gm-nav">
      <Link href="/gm/offseason" className={cn("gm-nav__link", pathname === "/gm/offseason" && "is-active")}>Season hub</Link>
      <Link href="/gm/contracts" className={cn("gm-nav__link", pathname === "/gm/contracts" && "is-active")}>Contracts</Link>
      <Link href="/gm/franchise" className={cn("gm-nav__link", pathname.startsWith("/gm/franchise") && "is-active")}>Franchise</Link>
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
            {t(link.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

