/** Appearance prefs (localStorage). Light/dark is public chrome; glass is default. */

export const COLOR_SCHEME_KEY = "ba-color-scheme";
export const SURFACE_KEY = "ba-surface";
export const REDUCE_MOTION_KEY = "ba-reduce-motion";

export type ColorScheme = "light" | "dark" | "system";
export type SurfaceStyle = "solid" | "glass";
export type MotionPref = "system" | "reduce";

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
  motion: MotionPref;
  prefersDark: boolean;
}) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolveDark(options.scheme, options.prefersDark));
  if (options.surface === "glass") {
    root.setAttribute("data-surface", "glass");
  } else {
    root.removeAttribute("data-surface");
  }
  if (options.motion === "reduce") root.setAttribute("data-reduce-motion", "on");
  else root.removeAttribute("data-reduce-motion");
}

/** Inline boot script - first paint matches stored prefs. Default: follow the system + glass. */
export const OWNER_THEME_BOOT_SCRIPT = `(function(){
  try {
    var t = localStorage.getItem("${COLOR_SCHEME_KEY}");
    var s = localStorage.getItem("${SURFACE_KEY}");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = t === "dark" || (t !== "light" && prefersDark);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.backgroundColor = dark ? "#0c0d11" : "#f2f2f7";
    if (s === "solid") document.documentElement.removeAttribute("data-surface");
    else document.documentElement.setAttribute("data-surface", "glass");
    if (localStorage.getItem("${REDUCE_MOTION_KEY}") === "reduce") {
      document.documentElement.setAttribute("data-reduce-motion", "on");
    }
  } catch (e) {}
})();`;
