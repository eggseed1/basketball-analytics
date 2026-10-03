/**
 * How a team got a player, built from ESPN transaction rows and baked draft
 * data. Safe for client components.
 */

export type PathAsset = {
  label: string;
  /** Stable match key: `p:{playerId}`, `pick:{year}:{round}` or `n:{name}`. */
  key: string;
  playerId?: string;
  nonPlayer?: true;
};

export type PathDealSide = { teamId: string; receives: PathAsset[] };

export type PathDeal = {
  date: string;
  eventIds: string[];
  sides: PathDealSide[];
  /** Items one team's row says it sent that the receiver's own row omits. */
  unconfirmed?: Array<PathAsset & { claimedByTeamId: string; toTeamId: string }>;
};

/** `pick` is the overall pick number. */
export type DraftSlot = { year: number; round: number; pick: number };

/** Another team made the pick; his rights moved in a deal the log skips. */
export type DraftedBy = DraftSlot & {
  teamId: string;
  /** This team's picks that year who first show up with the drafting team. */
  swappedFor?: DraftCandidate[];
};

export type Arrival =
  | { how: "trade"; date: string; eventId: string; fromTeamId?: string; deal: PathDeal; gave: PathAsset[] }
  | { how: "draft"; date: string; eventId?: string; draft?: DraftSlot; draftedBy?: DraftedBy }
  | { how: "signing"; date: string; eventId: string; draftedBy?: DraftedBy }
  | { how: "claim"; date: string; eventId: string }
  /** Already with the team when the log first mentions him (often a re-signing). */
  | { how: "first-seen"; date: string; eventId: string; draftedBy?: DraftedBy }
  | { how: "unknown" };

export type DraftCandidate = { label: string; playerId?: string; pick: number };

export type Departure =
  | { how: "trade"; date: string; eventId: string; toTeamId?: string; deal: PathDeal; got: PathAsset[] }
  | { how: "waived"; date: string; eventId: string }
  /** Signed or claimed by another team. */
  | { how: "left"; date: string; eventId: string; toTeamId: string; via: "signing" | "claim" }
  /** Shows up with another team next, and the log does not say how he left. */
  | { how: "next-seen"; date: string; eventId: string; teamId: string }
  /** A pick the team still held at its draft. */
  | { how: "used"; year: number; round: number; candidates: DraftCandidate[] }
  | { how: "pending"; year: number }
  | { how: "here" }
  | { how: "unknown" };

/** One asset's time with a team, and what it turned into. */
export type ForwardNode = {
  asset: PathAsset;
  teamId: string;
  since: string;
  departure: Departure;
  next: ForwardNode[];
};

/** How a team got an asset it later traded away. */
export type OriginNode = {
  asset: PathAsset;
  teamId: string;
  arrival: Arrival;
  origins: OriginNode[];
  /** Same deal as an origin listed earlier, so it is not expanded again. */
  repeat?: true;
};

export type AcquisitionStint = {
  start: string;
  how: Exclude<Arrival["how"], "unknown">;
  end?: string;
};

export type AcquisitionStory = {
  teamId: string;
  player: PathAsset;
  arrival: Arrival;
  /** How the team got the players and picks it gave up for him. */
  origins: OriginNode[];
  /** His time with the team and where it led. */
  afterwards: ForwardNode;
  /** Every time this team brought him in, newest first. */
  stints: AcquisitionStint[];
  /** Was the forward or backward walk cut short by the size caps. */
  truncated: boolean;
};

export type TeamAcquisitionEntry = {
  label: string;
  key: string;
  playerId?: string;
  date: string;
  how: AcquisitionStint["how"];
  onRoster: boolean;
};

export type AcquisitionPayload = {
  story: AcquisitionStory | null;
  teamNames: Record<string, string>;
  ledgerThrough: string | null;
};
