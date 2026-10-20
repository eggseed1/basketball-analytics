"use client";

import { CalendarDays, Ellipsis, Home, Shield, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { GlassSurface } from "@/components/brand/glass-surface";
import { TransitionLink } from "@/components/continuity/query-nav";
import { PRIMARY_NAV, type PrimaryNavItem } from "@/components/sports/site-nav";
import { cn } from "@/lib/utils";

const PINNED = ["home", "games", "players", "teams"] as const;

const ICONS = {
  home: Home,
  games: CalendarDays,
  players: Users,
  teams: Shield,
} as const;

/**
 * Bottom tab bar for the installed home-screen app.
 * Hidden in the browser; shown when html[data-standalone] is set.
 */
export function AppTabBar({
  pathname,
  menuOpen,
  onMore,
}: {
  pathname: string;
  menuOpen: boolean;
  onMore: () => void;
}) {
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const pinned = PINNED.map((id) => PRIMARY_NAV.find((item) => item.id === id)).filter(
    (item): item is PrimaryNavItem => Boolean(item)
  );
  const moreActive =
    menuOpen || pinned.every((item) => !item.match(pathname));

  const itemClass = (active: boolean) =>
    cn(
      "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] px-1 py-1.5 text-[10px] font-semibold tracking-tight",
      active ? "glass-pill glass-pill-active text-foreground" : "text-muted-foreground"
    );

  return (
    <GlassSurface
      as="nav"
      aria-label={t("primary")}
      effect="css"
      backdropBlur={20}
      className="app-tab-bar"
      style={{ borderRadius: 28, padding: 4 }}
    >
      {pinned.map((item) => {
        const id = item.id as keyof typeof ICONS;
        const Icon = ICONS[id];
        const active = item.match(pathname);
        return (
          <TransitionLink
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
            <span className="max-w-full truncate">{t.has(id) ? t(id) : item.label}</span>
          </TransitionLink>
        );
      })}
      <button
        type="button"
        aria-expanded={menuOpen}
        aria-controls="mobile-nav-menu"
        onClick={onMore}
        className={itemClass(moreActive)}
      >
        <Ellipsis className="size-[22px]" strokeWidth={moreActive ? 2.25 : 1.75} aria-hidden />
        <span className="max-w-full truncate">{tCommon("more")}</span>
      </button>
    </GlassSurface>
  );
}
