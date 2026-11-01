"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/gm", key: "nav_home" },
  { href: "/gm/roster", key: "nav_roster" },
  { href: "/gm/lineup", key: "nav_coaching" },
] as const;
const GROUPS = [
  { label: "Build your team", links: [
    { href: "/gm/contracts", label: "Contracts and extensions" },
    { href: "/gm/cap", label: "Salary sheet" },
    { href: "/gm/trade", label: "Trade machine" },
    { href: "/gm/free-agency", label: "Free agency" },
    { href: "/gm/draft", label: "Draft and scouting" },
  ] },
  { label: "Follow the league", links: [
    { href: "/gm/standings", label: "Standings" },
    { href: "/gm/schedule", label: "Schedule" },
    { href: "/gm/players", label: "Players and leaders" },
    { href: "/gm/teams", label: "Teams" },
    { href: "/gm/transactions", label: "Transactions" },
    { href: "/gm/awards", label: "Awards" },
  ] },
  { label: "Manage your franchise", links: [
    { href: "/gm/franchise", label: "Team plan and history" },
    { href: "/gm/staff", label: "Staff" },
    { href: "/gm/medical", label: "Medical report" },
  ] },
] as const;

function isCurrent(pathname: string, href: string) {
  return href === "/gm" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

export function GmNav() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const closeOutside = (event: Event) => {
      if (nav.current?.contains(event.target as Node)) return;
      const details = nav.current?.querySelector("details");
      if (details) details.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("focusin", closeOutside); };
  }, []);
  const t = useTranslations("Gm");
  const moreActive = GROUPS.some(group => group.links.some(link => isCurrent(pathname, link.href)));
  return <nav ref={nav} aria-label={t("nav_ariaLabel")} className="gm-desk-nav" onClick={event => {
    if (!(event.target as Element).closest("a")) return;
    const details = event.currentTarget.querySelector("details");
    if (details) details.open = false;
  }}>
    <div className="gm-desk-nav__primary">
      {PRIMARY.map(link => <Link key={link.href} href={link.href} aria-current={isCurrent(pathname, link.href) ? "page" : undefined} className={cn("gm-desk-nav__link", isCurrent(pathname, link.href) && "is-active")}>{t(link.key)}</Link>)}
      <Link href="/gm/development" aria-current={pathname === "/gm/development" ? "page" : undefined} className={cn("gm-desk-nav__link", pathname === "/gm/development" && "is-active")}>Development</Link>
      <Link href="/gm/offseason" aria-current={pathname === "/gm/offseason" ? "page" : undefined} className={cn("gm-desk-nav__link", pathname === "/gm/offseason" && "is-active")}>Season hub</Link>
      <details key={pathname} className="gm-desk-nav__more" onKeyDown={event => {
        if (event.key !== "Escape") return;
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }}>
        <summary aria-label="All desks" className={cn("gm-desk-nav__link", moreActive && "is-active")}>More <span aria-hidden="true">▾</span></summary>
        <div className="gm-desk-nav__menu">
          {GROUPS.map(group => <section key={group.label} aria-label={group.label}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
            <ul className="mt-2 grid gap-1">{group.links.map(link => <li key={link.href}><Link href={link.href} aria-current={isCurrent(pathname, link.href) ? "page" : undefined} className={cn("gm-desk-nav__item", isCurrent(pathname, link.href) && "is-active")}>{link.label}</Link></li>)}</ul>
          </section>)}
        </div>
      </details>
    </div>
  </nav>;
}
