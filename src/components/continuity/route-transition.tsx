"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { ViewportLoadingBar } from "@/components/continuity/viewport-loading-bar";
import { cn } from "@/lib/utils";

type RouteTransitionContextValue = {
  pending: boolean;
  /**
   * Run a router navigation and light soft-nav chrome.
   * Intentionally not wrapped in startTransition — that suppresses
   * destination `loading.tsx` while RSC streams (~1–3s on cold origin).
   */
  startRouteTransition: (fn: () => void) => void;
};

const RouteTransitionContext =
  createContext<RouteTransitionContextValue | null>(null);

export function useRouteTransitionOptional(): RouteTransitionContextValue | null {
  return useContext(RouteTransitionContext);
}

function RouteUpdatingChrome({ pending }: { pending: boolean }) {
  return (
    <>
      <ViewportLoadingBar active={pending} />
      {pending ? (
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Loading destination…
        </p>
      ) : null}
    </>
  );
}

/**
 * Site-wide soft navigation chrome. Keeps SportsShell (nav/chrome) visible
 * while the destination segment swaps to its loading.tsx, then the page.
 */
export function RouteTransitionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const pending = pendingPath !== null && pendingPath === pathname;
  if (pendingPath !== null && pendingPath !== pathname) setPendingPath(null);

  const startRouteTransition = useCallback((fn: () => void) => {
    setPendingPath(pathname);
    fn();
  }, [pathname]);

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
