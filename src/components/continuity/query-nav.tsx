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
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";

import { useRouteTransitionOptional } from "@/components/continuity/route-transition";
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

  const run = useCallback(
    (fn: () => void) => {
      if (routeTransition) routeTransition.startRouteTransition(fn);
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
      });
    },
    [router, run]
  );

  const replaceHref = useCallback(
    (href: string, options?: { scroll?: boolean }) => {
      run(() => {
        router.replace(href, { scroll: options?.scroll ?? true });
      });
    },
    [router, run]
  );

  const value = useMemo(
    () => ({
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
        data-updating={value.pending ? "true" : "false"}
      >
        <QueryUpdatingChrome pending={value.pending} />
        {children}
      </div>
    </QueryNavContext.Provider>
  );
}

/** Subtle top cue - never a full-page spinner. */
export function QueryUpdatingChrome({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="query-updating-bar" />
      <p className="sr-only">Updating results…</p>
    </div>
  );
}

/**
 * Link that marks navigation as a React transition so Suspense keeps
 * already-revealed content instead of flashing fallbacks.
 * When inside QueryNavProvider / RouteTransitionProvider, shares pending chrome.
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
  ...rest
}: ComponentProps<typeof Link> & { replace?: boolean }) {
  const router = useRouter();
  const queryNav = useQueryNavOptional();
  const routeTransition = useRouteTransitionOptional();
  const [localPending, startLocalTransition] = useTransition();
  const target = typeof href === "string" ? href : href.pathname ?? "";
  const pending = Boolean(
    queryNav?.pending || routeTransition?.pending || localPending
  );

  return (
    <Link
      href={href}
      prefetch={prefetch}
      scroll={scroll}
      className={cn(className, pending && "opacity-80")}
      aria-busy={pending || undefined}
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
        startLocalTransition(go);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
