"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type RouteTransitionContextValue = {
  pending: boolean;
  /** Run a router navigation inside a React transition (keeps prior UI). */
  startRouteTransition: (fn: () => void) => void;
};

const RouteTransitionContext =
  createContext<RouteTransitionContextValue | null>(null);

export function useRouteTransitionOptional(): RouteTransitionContextValue | null {
  return useContext(RouteTransitionContext);
}

function RouteUpdatingChrome({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60]"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="query-updating-bar" />
      <p className="sr-only">Loading destination…</p>
    </div>
  );
}

/**
 * Site-wide soft navigation chrome. Keeps SportsShell visible while the
 * destination RSC payload streams in (cross-route continuity).
 */
export function RouteTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();

  const startRouteTransition = useCallback((fn: () => void) => {
    startTransition(fn);
  }, []);

  const value = useMemo(
    () => ({ pending, startRouteTransition }),
    [pending, startRouteTransition]
  );

  return (
    <RouteTransitionContext.Provider value={value}>
      <div
        className={cn("relative flex min-h-0 flex-1 flex-col")}
        data-route-updating={pending ? "true" : "false"}
      >
        <RouteUpdatingChrome pending={pending} />
        {children}
      </div>
    </RouteTransitionContext.Provider>
  );
}
