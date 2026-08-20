"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  applyOwnerTheme,
  COLOR_SCHEME_KEY,
  isColorScheme,
  resolveDark,
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

const OwnerThemeContext = createContext<OwnerThemeContextValue | null>(null);

function readScheme(): ColorScheme {
  if (typeof window === "undefined") return "light";
  const raw = localStorage.getItem(COLOR_SCHEME_KEY);
  return isColorScheme(raw) ? raw : "light";
}

function readSurface(): SurfaceStyle {
  if (typeof window === "undefined") return "glass";
  const raw = localStorage.getItem(SURFACE_KEY);
  if (raw === "solid") return "solid";
  return "glass";
}

/**
 * Thin client island for light/dark + glass/solid.
 * Does not own app data and must not wrap RootLayout as a client component.
 */
export function OwnerThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>("light");
  const [surface, setSurfaceState] = useState<SurfaceStyle>("glass");
  const [hydrated, setHydrated] = useState(false);
  const [resolvedDark, setResolvedDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    setSchemeState(readScheme());
    setSurfaceState(readSurface());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const prefersDark = media.matches;
      setResolvedDark(resolveDark(scheme, prefersDark));
      applyOwnerTheme({
        scheme,
        surface,
        prefersDark,
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
    () => ({ scheme, surface, resolvedDark, setScheme, setSurface }),
    [scheme, surface, resolvedDark, setScheme, setSurface]
  );

  return (
    <OwnerThemeContext.Provider value={value}>
      {children}
    </OwnerThemeContext.Provider>
  );
}

export function useOwnerTheme(): OwnerThemeContextValue {
  const ctx = useContext(OwnerThemeContext);
  if (!ctx) {
    throw new Error("useOwnerTheme must be used within OwnerThemeProvider");
  }
  return ctx;
}
