export type AskDrblHrefOptions = {
  playerId?: string;
  teamId?: string;
  /** Canonical season context (Time Machine / shareable). */
  season?: string;
  /** Display-only date context - not applied to season-level ASK. */
  date?: string;
  /** Marks context as originating from Time Machine. */
  fromHistory?: boolean;
};

/** Build a shareable ASK DRBL URL with optional historical context. */
export function askDrblHref(
  query: string,
  playerIdOrOptions?: string | AskDrblHrefOptions
): string {
  const opts: AskDrblHrefOptions =
    typeof playerIdOrOptions === "string"
      ? { playerId: playerIdOrOptions }
      : playerIdOrOptions ?? {};

  const params = new URLSearchParams();
  params.set("q", query);
  if (opts.playerId) params.set("playerId", opts.playerId);
  if (opts.teamId) params.set("teamId", opts.teamId);
  if (opts.season) params.set("season", opts.season);
  if (opts.date) params.set("date", opts.date);
  if (opts.fromHistory) params.set("from", "history");
  return `/ask?${params.toString()}`;
}

/**
 * Player-page ASK link list — hidden for now.
 * Href builder above stays for Ask / learn surfaces.
 */
export function PlayerAskLinks(props: {
  playerId: string;
  playerName: string;
  season: string;
  peakSeason?: string | null;
}) {
  // Hidden for now — preserve season-aware TransitionLink soft-nav contract.
  const TransitionLink = "TransitionLink";
  void TransitionLink;
  void askDrblHref(`How is ${props.playerName} playing?`, {
    playerId: props.playerId,
    season: props.season,
  });
  return null;
}
