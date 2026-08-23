/**
 * Classic trade-tree shapes (safe for client components).
 * Built from ESPN free-text — best-effort genealogy, not a verified ledger.
 */

export type TradeTreeAssetKind = "player" | "pick" | "cash" | "other";

export type TradeTreeAsset = {
  id: string;
  kind: TradeTreeAssetKind;
  label: string;
  matchKey: string;
  playerId?: string | null;
  positionHint?: string | null;
  /** True when this asset is the asked-about acquisition. */
  focused?: boolean;
};

export type TradeTreeDisposition =
  | { kind: "traded"; toTeamAbbr: string | null; date: string; eventId: string }
  | { kind: "acquired"; fromTeamAbbr: string | null; date: string; eventId: string }
  | { kind: "waived"; date: string; eventId: string }
  | { kind: "drafted"; date: string; eventId: string; playerLabel?: string }
  | { kind: "signed"; date: string; eventId: string }
  | { kind: "terminal"; note: string }
  | { kind: "open"; note?: string };

export type TradeTreeNode = {
  id: string;
  /** Team that received these assets (focus franchise for the branch). */
  teamId: string;
  teamAbbr: string;
  date: string;
  eventId: string;
  description: string;
  assets: TradeTreeAsset[];
  /** How the parent asset was moved into this node (null for root haul). */
  via: TradeTreeDisposition | null;
  /** One child branch per parent asset that was later moved. */
  children: Array<{
    fromAssetId: string;
    fromAssetLabel: string;
    disposition: TradeTreeDisposition;
    node: TradeTreeNode | null;
  }>;
};

export type TradeTreeRootOption = {
  eventId: string;
  date: string;
  label: string;
  gotCount: number;
  sentCount: number;
  counterpartyAbbr: string | null;
  /** Players the focus team acquired in this deal (for “how did they get X?”). */
  gotPlayers: Array<{
    label: string;
    matchKey: string;
    playerId?: string | null;
  }>;
};

/** Flat searchable acquisition index for a franchise. */
export type TradeTreePlayerHit = {
  label: string;
  matchKey: string;
  playerId?: string | null;
  eventId: string;
  date: string;
  counterpartyAbbr: string | null;
  dealLabel: string;
};

export type TeamTradeTree = {
  teamId: string;
  teamAbbr: string;
  teamName: string;
  rootEventId: string;
  title: string;
  rootDate: string;
  /** Asked-about player when deep-linking from search. */
  focusPlayerMatchKey: string | null;
  focusPlayerLabel: string | null;
  /** Assets the focus team sent in the root deal (often the headline player). */
  rootSent: TradeTreeAsset[];
  /** Counterparties shown on the other side of the root deal. */
  rootCounterparties: Array<{
    teamId: string;
    teamAbbr: string;
    assets: TradeTreeAsset[];
    description: string;
    eventId: string;
  }>;
  /**
   * How focus previously acquired each outbound root asset (backward genealogy).
   * One tree per sent player/pick when a prior inbound move exists.
   */
  ancestry: TradeTreeNode[];
  /** Focus team haul — the trunk of the classic forward tree. */
  root: TradeTreeNode;
  rootOptions: TradeTreeRootOption[];
  /** Complete searchable player acquisitions for this franchise. */
  playerCatalog: TradeTreePlayerHit[];
  depth: number;
  branchCount: number;
  ancestryDepth: number;
  disclaimer: string;
};
