"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarDays, ChevronDown, ClipboardList, House, LayoutGrid, TrendingUp, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const MAIN = [
  { href: "/gm", key: "nav_home", icon: House },
  { href: "/gm/roster", key: "nav_roster", icon: UsersRound },
  { href: "/gm/lineup", key: "nav_coaching", icon: ClipboardList },
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
  { label: "Front office", links: [
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
    <div className="gm-desk-nav__scroller">
      <div className="gm-desk-nav__primary">
        {MAIN.map(({ href, key, icon: Icon }) => <Link key={href} href={href} aria-current={isCurrent(pathname, href) ? "page" : undefined} className={cn("gm-desk-nav__link", isCurrent(pathname, href) && "is-active")}><Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{t(key)}</span></Link>)}
        <Link href="/gm/development" aria-current={isCurrent(pathname, "/gm/development") ? "page" : undefined} className={cn("gm-desk-nav__link", isCurrent(pathname, "/gm/development") && "is-active")}><TrendingUp size={16} strokeWidth={1.8} aria-hidden="true" /><span>Development</span></Link>
        <Link href="/gm/offseason" aria-current={isCurrent(pathname, "/gm/offseason") ? "page" : undefined} className={cn("gm-desk-nav__link", isCurrent(pathname, "/gm/offseason") && "is-active")}><CalendarDays size={16} strokeWidth={1.8} aria-hidden="true" /><span>Season hub</span></Link>
      </div>
    </div>
    <details key={pathname} className="gm-desk-nav__more" onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
    }}>
      <summary aria-label="All desks" className={cn("gm-desk-nav__link gm-desk-nav__more-trigger", moreActive && "is-active")}><LayoutGrid size={16} strokeWidth={1.8} aria-hidden="true" /><span>More</span><ChevronDown size={12} aria-hidden="true" /></summary>
      <div className="gm-desk-nav__menu">
        {GROUPS.map(group => <section key={group.label} aria-label={group.label}>
          <h2 className="gm-desk-nav__group-label">{group.label}</h2>
          <ul className="mt-2 grid gap-1">{group.links.map(link => <li key={link.href}><Link href={link.href} aria-current={isCurrent(pathname, link.href) ? "page" : undefined} className={cn("gm-desk-nav__item", isCurrent(pathname, link.href) && "is-active")}>{link.label}</Link></li>)}</ul>
        </section>)}
      </div>
    </details>
  </nav>;
}
