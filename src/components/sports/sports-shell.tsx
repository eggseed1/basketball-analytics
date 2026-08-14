"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { Menu, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  PRIMARY_NAV,
  activePrimaryNav,
  type NavLink,
  type PrimaryNavItem,
} from "@/components/sports/site-nav";

function SiteSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) {
      router.push("/explore/players");
      return;
    }
    router.push(`/explore/players?player=${encodeURIComponent(term)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md sm:flex-none lg:max-w-lg"
    >
      <label className="sr-only" htmlFor="site-search">
        Search players and teams
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-secondary px-3 py-2">
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
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground text-background"
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
          <Link
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
          </Link>
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
    <Link
      href={tab.href}
      className={cn(
        "shrink-0 rounded-md px-3 py-1.5 text-[14px] font-semibold transition-colors",
        tab.prominent && !active && "text-foreground",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        tab.prominent && active && "ring-2 ring-foreground/20 ring-offset-1"
      )}
    >
      {tab.label}
    </Link>
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
  const active = useMemo(() => activePrimaryNav(pathname), [pathname]);

  const mobilePinned = PRIMARY_NAV.filter((t) => MOBILE_PINNED_IDS.has(t.id));
  const mobileMore = PRIMARY_NAV.filter((t) => !MOBILE_PINNED_IDS.has(t.id));
  const moreActive = mobileMore.some((t) => t.match(pathname));

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[color-mix(in_oklab,#f2f2f7_92%,white)] backdrop-blur-xl">
        <div className="site-shell flex flex-col gap-2 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span
                className="flex size-8 items-center justify-center rounded-md bg-foreground text-[11px] font-bold tracking-wide text-background"
                aria-hidden
              >
                DRBL
              </span>
              <span className="hidden text-[1.25rem] font-bold tracking-tight sm:inline">
                DRBL
              </span>
            </Link>
            <div className="ml-auto flex min-w-0 flex-1 justify-end sm:flex-initial">
              <SiteSearch />
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
            <Link href="/gm" className="sports-pill shrink-0 text-[13px]">
              GM mode
            </Link>
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
            <div className="relative shrink-0">
              <button
                type="button"
                aria-expanded={moreOpen}
                aria-controls="mobile-more-nav"
                onClick={() => setMoreOpen((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[14px] font-semibold",
                  moreActive || moreOpen
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {moreOpen ? (
                  <X className="size-3.5" aria-hidden />
                ) : (
                  <Menu className="size-3.5" aria-hidden />
                )}
                More
              </button>
              {moreOpen ? (
                <div
                  id="mobile-more-nav"
                  className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-md border border-border bg-background p-1 shadow-md"
                >
                  {mobileMore.map((tab) => (
                    <Link
                      key={tab.id}
                      href={tab.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "block rounded-md px-3 py-2 text-[14px] font-semibold",
                        tab.match(pathname)
                          ? "bg-foreground text-background"
                          : "text-foreground hover:bg-secondary"
                      )}
                    >
                      {tab.label}
                    </Link>
                  ))}
                  <Link
                    href="/gm"
                    onClick={() => setMoreOpen(false)}
                    className="mt-1 block rounded-md border-t border-border px-3 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    GM mode
                  </Link>
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
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}
