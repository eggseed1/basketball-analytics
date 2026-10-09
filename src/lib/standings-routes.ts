import { TEAM_VIZ_DEFAULT_VIEW, type TeamVizView } from "@/lib/team-viz";

export type StandingsSection = "conferences" | "bracket" | "team-stats";

export const STANDINGS_VISUALIZATIONS_PATH = "/standings/visualizations";

export function standingsHref(season?: string, section?: StandingsSection): string {
  const qs = season ? `?season=${encodeURIComponent(season)}` : "";
  return `/standings${qs}${section ? `#${section}` : ""}`;
}

/** Legacy board/bracket/tracker URLs: same query string, new page and section. */
export function legacyStandingsRedirect(requestUrl: string, path: string, section?: string): URL {
  const from = new URL(requestUrl);
  const to = new URL(path, from);
  to.search = from.search;
  if (section) to.hash = section;
  return to;
}

export function standingsVisualizationsHref(season?: string, view?: TeamVizView): string {
  const params = new URLSearchParams();
  if (view && view !== TEAM_VIZ_DEFAULT_VIEW) params.set("view", view);
  if (season) params.set("season", season);
  const qs = params.toString();
  return qs ? `${STANDINGS_VISUALIZATIONS_PATH}?${qs}` : STANDINGS_VISUALIZATIONS_PATH;
}
