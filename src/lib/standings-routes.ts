export type StandingsSection = "conferences" | "bracket" | "team-stats";
export type StandingsVisualizationsSection = "margin" | "tracker";

export const STANDINGS_VISUALIZATIONS_PATH = "/standings/visualizations";

function withQuery(path: string, season: string | undefined, hash: string | undefined): string {
  const qs = season ? `?season=${encodeURIComponent(season)}` : "";
  return `${path}${qs}${hash ? `#${hash}` : ""}`;
}

export function standingsHref(season?: string, section?: StandingsSection): string {
  return withQuery("/standings", season, section);
}

/** Legacy board/bracket/tracker URLs: same query string, new page and section. */
export function legacyStandingsRedirect(requestUrl: string, path: string, section: string): URL {
  const from = new URL(requestUrl);
  const to = new URL(path, from);
  to.search = from.search;
  to.hash = section;
  return to;
}

export function standingsVisualizationsHref(
  season?: string,
  section?: StandingsVisualizationsSection
): string {
  return withQuery(STANDINGS_VISUALIZATIONS_PATH, season, section);
}
