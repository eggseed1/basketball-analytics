"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  applyOwnerTheme,
  COLOR_SCHEME_KEY,
  isColorScheme,
  SURFACE_KEY,
  type ColorScheme,
  type SurfaceStyle,
} from "@/lib/owner-theme";

type OwnerThemeContextValue = {
  scheme: ColorScheme;
  surface: SurfaceStyle;
  resolvedDark: boolean;
  setScheme: (scheme: ColorScheme) => void;
  setSurface: (surface: SurfaceStyle) => void;
};

const OwnerThemeContext = createContext<Omit<
  OwnerThemeContextValue,
  "resolvedDark"
> | null>(null);

function readScheme(): ColorScheme {
  if (typeof window === "undefined") return "system";
  const raw = localStorage.getItem(COLOR_SCHEME_KEY);
  return isColorScheme(raw) ? raw : "system";
}

function readSurface(): SurfaceStyle {
  if (typeof window === "undefined") return "glass";
  const raw = localStorage.getItem(SURFACE_KEY);
  if (raw === "solid") return "solid";
  return "glass";
}

const darkListeners = new Set<() => void>();
let darkObserver: MutationObserver | null = null;

/** One observer on <html class> shared by every theme consumer. */
function subscribeDarkClass(onChange: () => void) {
  darkListeners.add(onChange);
  if (!darkObserver) {
    darkObserver = new MutationObserver(() => darkListeners.forEach((fn) => fn()));
    darkObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
  return () => {
    darkListeners.delete(onChange);
    if (darkListeners.size === 0) {
      darkObserver?.disconnect();
      darkObserver = null;
    }
  };
}

const readDarkClass = () => document.documentElement.classList.contains("dark");
/** Server HTML is always light; the boot script may add `dark` before hydration. */
const serverDarkClass = () => false;

export function OwnerThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>("system");
  const [surface, setSurfaceState] = useState<SurfaceStyle>("glass");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSchemeState(readScheme());
    setSurfaceState(readSurface());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      applyOwnerTheme({
        scheme,
        surface,
        prefersDark: media.matches,
      });
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [hydrated, scheme, surface]);

  const setScheme = useCallback((next: ColorScheme) => {
    localStorage.setItem(COLOR_SCHEME_KEY, next);
    setSchemeState(next);
  }, []);

  const setSurface = useCallback((next: SurfaceStyle) => {
    localStorage.setItem(SURFACE_KEY, next);
    setSurfaceState(next);
  }, []);

  const value = useMemo(
    () => ({ scheme, surface, setScheme, setSurface }),
    [scheme, surface, setScheme, setSurface]
  );

  return (
    <OwnerThemeContext.Provider value={value}>
      {children}
    </OwnerThemeContext.Provider>
  );
}

/**
 * `resolvedDark` is read per consumer from the store, not from context: React
 * then hydrates every boundary (including late streamed ones) against the
 * light server snapshot and updates right after, so dark mode never mismatches.
 */
export function useOwnerTheme(): OwnerThemeContextValue {
  const ctx = useContext(OwnerThemeContext);
  const resolvedDark = useSyncExternalStore(
    subscribeDarkClass,
    readDarkClass,
    serverDarkClass
  );
  if (!ctx) {
    throw new Error("useOwnerTheme must be used within OwnerThemeProvider");
  }
  return useMemo(() => ({ ...ctx, resolvedDark }), [ctx, resolvedDark]);
}
