"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Menu, X } from "lucide-react";

import { NBA_ATMOSPHERE, PageAtmosphere } from "@/components/brand/page-atmosphere";
import { DrblLogo } from "@/components/brand/drbl-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import { RouteTransitionProvider } from "@/components/continuity/route-transition";
import { ColorSchemeSwitch } from "@/components/sports/color-scheme-switch";
import { SiteChrome } from "@/components/sports/site-chrome";
import { SiteSearch } from "@/components/sports/site-search";
import { cn } from "@/lib/utils";
import {
  PRIMARY_NAV,
  activePrimaryNav,
  type NavLink,
  type PrimaryNavItem,
} from "@/components/sports/site-nav";

function subnavActive(link: NavLink, pathname: string, search: string): boolean {
  if (link.match) {
    // Schedule vs Scores both live on /scores - disambiguate by view=.
    if (link.href.includes("view=week")) {
      return (
        (pathname === "/scores" || pathname.startsWith("/scores/")) &&
        (search.includes("view=week") || search.includes("view=month"))
      );
    }
    if (link.href === "/scores") {
      return (
        (pathname === "/scores" || pathname.startsWith("/scores/")) &&
        !search.includes("view=week") &&
        !search.includes("view=month")
      );
    }
    return link.match(pathname);
  }
  const pathOnly = link.href.split("?")[0] ?? link.href;
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

function DomainSubnav({ item }: { item: PrimaryNavItem }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  if (!item.subnav?.length) return null;

  return (
    <nav
      aria-label={`${item.label} sections`}
      className="site-subnav"
    >
      <div
        role="tablist"
        className="flex max-w-full items-center gap-0.5 touch-scroll-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {item.subnav.map((link) => {
          const active = subnavActive(link, pathname, search);
          return (
            <TransitionLink
              key={link.href}
              href={link.href}
              role="tab"
              aria-selected={active}
              className={cn(
                "relative shrink-0 px-3 py-1.5 text-[12px] font-semibold tracking-tight transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
              {active ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground"
                />
              ) : null}
            </TransitionLink>
          );
        })}
      </div>
    </nav>
  );
}

function PrimaryLink({
  tab,
  active,
}: {
  tab: PrimaryNavItem;
  active: boolean;
}) {
  return (
    <TransitionLink
      href={tab.href}
      className={cn(
        "shrink-0 rounded-md px-3 py-1.5 text-[14px] font-semibold transition-colors",
        active
          ? "glass-pill glass-pill-active text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {tab.label}
    </TransitionLink>
  );
}

export function SportsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  const active = useMemo(() => activePrimaryNav(pathname), [pathname]);
  const isMenuOpen = menuOpen && menuOpenedAt === pathname;
  const destinationWash =
    pathname.startsWith("/teams/") ||
    pathname.startsWith("/players/") ||
    pathname.startsWith("/games/");

  function closeMenu() {
    setMenuOpen(false);
    setMenuOpenedAt(null);
  }

  function toggleMenu() {
    if (isMenuOpen) {
      closeMenu();
      return;
    }
    setMenuOpen(true);
    setMenuOpenedAt(pathname);
  }

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [isMenuOpen]);

  return (
    <RouteTransitionProvider>
      <div className="flex min-h-full min-w-0 flex-1 flex-col overflow-x-clip">
        {destinationWash ? null : (
          <PageAtmosphere
            colorA={NBA_ATMOSPHERE.colorA}
            colorB={NBA_ATMOSPHERE.colorB}
          />
        )}
        <SiteChrome>
          <div
            className={cn(
              "site-shell flex min-w-0 flex-col gap-2 py-3",
              active?.subnav?.length && "pb-2.5"
            )}
          >
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <TransitionLink
                href="/"
                className="flex shrink-0 items-center gap-2"
                aria-label="DRBL home"
              >
                <DrblLogo withWordmark />
              </TransitionLink>
              <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-initial">
                <SiteSearch />
                <div className="hidden md:block">
                  <ColorSchemeSwitch />
                </div>
                <button
                  type="button"
                  aria-label="Open menu"
                  aria-expanded={isMenuOpen}
                  aria-controls="mobile-nav-menu"
                  onClick={toggleMenu}
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition hover:bg-muted md:hidden"
                >
                  <Menu className="size-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* Desktop / tablet: full ordered nav */}
            <div className="hidden flex-wrap items-center gap-x-2 gap-y-2 md:flex">
              <nav
                aria-label="Primary"
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
              >
                {PRIMARY_NAV.map((tab) => (
                  <PrimaryLink
                    key={tab.id}
                    tab={tab}
                    active={tab.match(pathname)}
                  />
                ))}
              </nav>
              <TransitionLink
                href="/gm"
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-[14px] font-semibold transition-colors",
                  pathname.startsWith("/gm")
                    ? "glass-pill glass-pill-active text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Franchise Lab — unfinished simulation scaffold"
              >
                GM lab
              </TransitionLink>
            </div>
          </div>

          {active?.subnav?.length ? (
            <div className="site-subnav-band border-t border-border/55 bg-secondary/45 dark:bg-secondary/70">
              <div className="site-shell py-2">
                <Suspense fallback={null}>
                  <DomainSubnav item={active} />
                </Suspense>
              </div>
            </div>
          ) : null}
        </SiteChrome>

        {isMenuOpen ? (
          <div
            id="mobile-nav-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="fixed inset-0 z-[60] flex flex-col bg-background pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] md:hidden"
          >
            <div className="site-shell flex shrink-0 items-center justify-between gap-4 border-b border-border py-3">
              <DrblLogo />
              <button
                type="button"
                aria-label="Close menu"
                onClick={closeMenu}
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition hover:bg-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <nav
              aria-label="Primary"
              className="site-shell flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-auto py-4"
            >
              {PRIMARY_NAV.map((tab) => (
                <TransitionLink
                  key={tab.id}
                  href={tab.href}
                  onClick={closeMenu}
                  className={cn(
                    "rounded-lg px-3 py-3.5 text-[20px] font-semibold tracking-tight transition-colors",
                    tab.prominent
                      ? tab.match(pathname)
                        ? "glass-pill glass-pill-active text-foreground"
                        : "text-foreground hover:bg-secondary/70"
                      : tab.match(pathname)
                        ? "bg-secondary text-foreground"
                        : "text-foreground hover:bg-secondary/70"
                  )}
                >
                  {tab.label}
                </TransitionLink>
              ))}
              <TransitionLink
                href="/gm"
                onClick={closeMenu}
                className={cn(
                  "mt-2 rounded-lg border-t border-border px-3 py-3.5 text-[18px] font-semibold transition-colors",
                  pathname.startsWith("/gm")
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                )}
              >
                GM lab
                <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">
                  Unfinished Franchise Lab scaffold
                </span>
              </TransitionLink>
            </nav>

            <div className="site-shell flex shrink-0 items-center justify-between gap-3 border-t border-border py-4">
              <span className="text-[14px] font-semibold text-muted-foreground">
                Appearance
              </span>
              <ColorSchemeSwitch />
            </div>
          </div>
        ) : null}

        <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip pb-[env(safe-area-inset-bottom,0px)]">
          {children}
        </div>
      </div>
    </RouteTransitionProvider>
  );
}
