/** Appearance prefs (localStorage). Light/dark is public chrome; glass is default. */

export const COLOR_SCHEME_KEY = "ba-color-scheme";
export const SURFACE_KEY = "ba-surface";

export type ColorScheme = "light" | "dark" | "system";
export type SurfaceStyle = "solid" | "glass";

export function isColorScheme(value: string | null): value is ColorScheme {
  return value === "light" || value === "dark" || value === "system";
}

export function isSurfaceStyle(value: string | null): value is SurfaceStyle {
  return value === "solid" || value === "glass";
}

export function resolveDark(
  scheme: ColorScheme,
  prefersDark: boolean
): boolean {
  if (scheme === "dark") return true;
  if (scheme === "light") return false;
  return prefersDark;
}

export function applyOwnerTheme(options: {
  scheme: ColorScheme;
  surface: SurfaceStyle;
  prefersDark: boolean;
}) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolveDark(options.scheme, options.prefersDark));
  if (options.surface === "glass") {
    root.setAttribute("data-surface", "glass");
  } else {
    root.removeAttribute("data-surface");
  }
}

/** Inline boot script - first paint matches stored prefs. Default: light + glass. */
export const OWNER_THEME_BOOT_SCRIPT = `(function(){
  try {
    var t = localStorage.getItem("${COLOR_SCHEME_KEY}");
    var s = localStorage.getItem("${SURFACE_KEY}");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = t === "dark" || (t === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", dark);
    if (s === "solid") document.documentElement.removeAttribute("data-surface");
    else document.documentElement.setAttribute("data-surface", "glass");
  } catch (e) {}
})();`;
