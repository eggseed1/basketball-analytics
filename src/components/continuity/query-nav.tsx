"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";

import { useRouteTransitionOptional } from "@/components/continuity/route-transition";
import { LoadingBarSignal } from "@/components/continuity/viewport-loading-bar";
import { cn } from "@/lib/utils";

type QueryNavContextValue = {
  pending: boolean;
  /** Soft-replace search params (keeps prior UI via startTransition). */
  replaceParams: (patch: Record<string, string | null>) => void;
  /** Soft-push a full href. */
  pushHref: (href: string, options?: { scroll?: boolean }) => void;
  /** Soft-replace a full href. */
  replaceHref: (href: string, options?: { scroll?: boolean }) => void;
  pathname: string;
  searchParams: URLSearchParams;
};

const QueryNavContext = createContext<QueryNavContextValue | null>(null);

export function useQueryNav(): QueryNavContextValue {
  const ctx = useContext(QueryNavContext);
  if (!ctx) {
    throw new Error("useQueryNav must be used within QueryNavProvider");
  }
  return ctx;
}

export function useQueryNavOptional(): QueryNavContextValue | null {
  return useContext(QueryNavContext);
}

/**
 * Shared transition-aware URL updates for filter/sort/page surfaces.
 * Pending state dims the content region without blanking it.
 */
export function QueryNavProvider({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const routeTransition = useRouteTransitionOptional();

  // In-place updates (same path, new params) run on this provider's own
  // transition so the results cue sits over these results; leaving the page
  // runs on the route transition and only the viewport-top bar shows.
  const run = useCallback(
    (fn: () => void, href?: string) => {
      const samePath =
        href == null ||
        new URL(href, window.location.href).pathname === window.location.pathname;
      if (routeTransition && !samePath) routeTransition.startRouteTransition(fn);
      else startTransition(fn);
    },
    [routeTransition]
  );

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      run(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, run, searchParams]
  );

  const pushHref = useCallback(
    (href: string, options?: { scroll?: boolean }) => {
      run(() => {
        router.push(href, { scroll: options?.scroll ?? true });
      }, href);
    },
    [router, run]
  );

  const replaceHref = useCallback(
    (href: string, options?: { scroll?: boolean }) => {
      run(() => {
        router.replace(href, { scroll: options?.scroll ?? true });
      }, href);
    },
    [router, run]
  );

  const value = useMemo(
    () => ({
      // Expose combined pending for link aria-busy / opacity.
      pending: Boolean(pending || routeTransition?.pending),
      replaceParams,
      pushHref,
      replaceHref,
      pathname,
      searchParams,
    }),
    [
      pending,
      pathname,
      pushHref,
      replaceHref,
      replaceParams,
      routeTransition?.pending,
      searchParams,
    ]
  );

  return (
    <QueryNavContext.Provider value={value}>
      <div
        className={cn("relative flex flex-col gap-5", className)}
        // Only dim the prior board for same-path filter/sort updates.
        // Cross-route soft nav must swap to loading.tsx, not freeze this page.
        data-updating={pending ? "true" : "false"}
      >
        <QueryUpdatingChrome pending={pending} />
        {children}
      </div>
    </QueryNavContext.Provider>
  );
}

/** Top progress + a visible “Updating…” chip (thin bar alone was too easy to miss). */
export function QueryUpdatingChrome({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <>
      <LoadingBarSignal />
      <div
        className="pointer-events-none sticky top-0 z-30 flex justify-center px-3 pt-2"
        aria-hidden
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/95 px-3 py-1.5 text-[13px] font-semibold text-foreground shadow-sm backdrop-blur-md">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          Updating…
        </span>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Updating results…
      </p>
    </>
  );
}

/**
 * Soft-nav link. Cross-route clicks light route chrome and let destination
 * `loading.tsx` mount (no startTransition). In-place query changes still use
 * QueryNavProvider transitions so filters keep prior UI.
 *
 * Cross-route: scroll=true (default). In-place query changes: scroll=false.
 */
export function TransitionLink({
  href,
  className,
  children,
  replace = false,
  scroll = true,
  prefetch,
  onClick,
  onPointerEnter,
  onFocus,
  ...rest
}: ComponentProps<typeof Link> & { replace?: boolean }) {
  const router = useRouter();
  const queryNav = useQueryNavOptional();
  const routeTransition = useRouteTransitionOptional();
  const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const localPending = pendingPath !== null && pendingPath === pathname;
  if (pendingPath !== null && pendingPath !== pathname) setPendingPath(null);
  const target = typeof href === "string" ? href : href.pathname ?? "";
  const pending = Boolean(
    queryNav?.pending || routeTransition?.pending || localPending
  );
  // Dense player boards can expose dozens of links at once. Next's automatic
  // viewport prefetch turned that into dozens of concurrent dynamic player
  // renders on Vercel. Preserve explicit caller intent, but default expensive
  // player destinations to click/intent navigation rather than bulk prefetch.
  const resolvedPrefetch =
    prefetch ?? (target.startsWith("/players/") ? false : undefined);
  const allowIntentPrefetch = resolvedPrefetch !== false;

  const prefetchTarget = useCallback(() => {
    if (!allowIntentPrefetch || !target) return;
    void router.prefetch(target);
  }, [allowIntentPrefetch, router, target]);

  return (
    <Link
      href={href}
      prefetch={resolvedPrefetch}
      scroll={scroll}
      className={cn(className, pending && "opacity-80")}
      aria-busy={pending || undefined}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        prefetchTarget();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        prefetchTarget();
      }}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        const go = () => {
          if (replace) router.replace(target, { scroll });
          else router.push(target, { scroll });
        };
        if (queryNav) {
          if (replace) queryNav.replaceHref(target, { scroll });
          else queryNav.pushHref(target, { scroll });
          return;
        }
        if (routeTransition) {
          routeTransition.startRouteTransition(go);
          return;
        }
        // Same as RouteTransitionProvider: show loading.tsx, don't suppress it.
        setPendingPath(pathname);
        go();
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
