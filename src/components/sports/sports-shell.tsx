"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Menu, Search, X } from "lucide-react";

import { NBA_ATMOSPHERE, PageAtmosphere } from "@/components/brand/page-atmosphere";
import { TransitionLink } from "@/components/continuity/query-nav";
import { RouteTransitionProvider, useRouteTransitionOptional } from "@/components/continuity/route-transition";
import { ColorSchemeSwitch } from "@/components/sports/color-scheme-switch";
import { SiteChrome } from "@/components/sports/site-chrome";
import { cn } from "@/lib/utils";
import { assertInternalHref } from "@/lib/navigation";
import {
  PRIMARY_NAV,
  activePrimaryNav,
  type NavLink,
  type PrimaryNavItem,
} from "@/components/sports/site-nav";

function SiteSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const routeTransition = useRouteTransitionOptional();
  const pending = Boolean(routeTransition?.pending);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    const href = !term
      ? assertInternalHref("/explore/players")
      : assertInternalHref(
          `/explore/players?player=${encodeURIComponent(term)}`
        );
    const go = () => router.push(href);
    if (routeTransition) routeTransition.startRouteTransition(go);
    else go();
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md sm:flex-none lg:max-w-lg"
      data-updating={pending ? "true" : "false"}
    >
      <label className="sr-only" htmlFor="site-search">
        Search players and teams
      </label>
      <div className="site-search-field flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          id="site-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players / teams"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
        />
      </div>
      <button
        type="submit"
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Search"
      >
        <Search className="size-4" />
      </button>
    </form>
  );
}

function subnavActive(link: NavLink, pathname: string, search: string): boolean {
  if (link.match) {
    // Schedule vs Scores both live on /scores — disambiguate by view=.
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
      className="flex items-center gap-1 overflow-x-auto pb-0.5"
    >
      {item.subnav.map((link) => {
        const active = subnavActive(link, pathname, search);
        return (
          <TransitionLink
            key={link.href}
            href={link.href}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            )}
          >
            {link.label}
          </TransitionLink>
        );
      })}
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
        "shrink-0 rounded-md px-3 py-1.5 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        tab.prominent && !active && "text-foreground",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        tab.prominent && active && "ring-2 ring-foreground/20 ring-offset-1"
      )}
    >
      {tab.label}
    </TransitionLink>
  );
}

/** Items kept in the always-visible mobile strip; rest go under More. */
const MOBILE_PINNED_IDS = new Set([
  "home",
  "ask",
  "games",
  "players",
  "teams",
]);

export function SportsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreOpenedAt, setMoreOpenedAt] = useState<string | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const active = useMemo(() => activePrimaryNav(pathname), [pathname]);
  const isMoreOpen = moreOpen && moreOpenedAt === pathname;
  const destinationWash =
    pathname.startsWith("/teams/") ||
    pathname.startsWith("/players/") ||
    pathname.startsWith("/games/");

  const mobilePinned = PRIMARY_NAV.filter((t) => MOBILE_PINNED_IDS.has(t.id));
  const mobileMore = PRIMARY_NAV.filter((t) => !MOBILE_PINNED_IDS.has(t.id));
  const moreActive = mobileMore.some((t) => t.match(pathname));

  function closeMore() {
    setMoreOpen(false);
    setMoreOpenedAt(null);
  }

  function toggleMore() {
    if (isMoreOpen) {
      closeMore();
      return;
    }
    setMoreOpen(true);
    setMoreOpenedAt(pathname);
  }

  useEffect(() => {
    if (!isMoreOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = moreRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        closeMore();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMore();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isMoreOpen, pathname]);

  return (
    <RouteTransitionProvider>
      <div className="relative flex min-h-full flex-1 flex-col">
        {destinationWash ? null : (
          <PageAtmosphere
            colorA={NBA_ATMOSPHERE.colorA}
            colorB={NBA_ATMOSPHERE.colorB}
          />
        )}
        <SiteChrome>
          <div className="site-shell flex flex-col gap-2 py-3">
            <div className="flex items-center gap-4">
              <TransitionLink href="/" className="flex shrink-0 items-center gap-2">
                <span
                  className="flex size-8 items-center justify-center rounded-md bg-foreground text-[12px] font-bold tracking-wide text-background"
                  aria-hidden
                >
                  DRBL
                </span>
                <span className="hidden text-[1.25rem] font-bold tracking-tight sm:inline">
                  DRBL
                </span>
              </TransitionLink>
              <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-initial">
                <SiteSearch />
                <ColorSchemeSwitch />
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
              <TransitionLink href="/gm" className="sports-pill shrink-0 text-[13px]">
                GM mode
              </TransitionLink>
            </div>

            {/* Mobile: pinned destinations + More */}
            <div className="flex items-center gap-1 md:hidden">
              <nav
                aria-label="Primary"
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
              >
                {mobilePinned.map((tab) => (
                  <PrimaryLink
                    key={tab.id}
                    tab={tab}
                    active={tab.match(pathname)}
                  />
                ))}
              </nav>
              <div className="relative shrink-0" ref={moreRef}>
                <button
                  type="button"
                  aria-expanded={isMoreOpen}
                  aria-controls="mobile-more-nav"
                  onClick={toggleMore}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[14px] font-semibold",
                    moreActive || isMoreOpen
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {isMoreOpen ? (
                    <X className="size-3.5" aria-hidden />
                  ) : (
                    <Menu className="size-3.5" aria-hidden />
                  )}
                  More
                </button>
                {isMoreOpen ? (
                  <div
                    id="mobile-more-nav"
                    className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-md border border-border bg-background p-1 shadow-md"
                  >
                    {mobileMore.map((tab) => (
                      <TransitionLink
                        key={tab.id}
                        href={tab.href}
                        onClick={closeMore}
                        className={cn(
                          "block rounded-md px-3 py-2 text-[14px] font-semibold",
                          tab.match(pathname)
                            ? "bg-foreground text-background"
                            : "text-foreground hover:bg-secondary"
                        )}
                      >
                        {tab.label}
                      </TransitionLink>
                    ))}
                    <TransitionLink
                      href="/gm"
                      onClick={closeMore}
                      className="mt-1 block rounded-md border-t border-border px-3 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      GM mode
                    </TransitionLink>
                  </div>
                ) : null}
              </div>
            </div>

            {active?.subnav?.length ? (
              <Suspense fallback={null}>
                <DomainSubnav item={active} />
              </Suspense>
            ) : null}
          </div>
        </SiteChrome>

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </RouteTransitionProvider>
  );
}
