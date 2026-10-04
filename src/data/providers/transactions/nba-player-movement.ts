/**
 * NBA.com player movement (stats.nba.com/js/data/playermovement) as a gap
 * filler for the ESPN transaction archive. ESPN's feed skips some moves
 * outright (the Sept 2026 Kawhi Leonard trade, most of 2018 to 2020), so
 * every NBA.com move that no ESPN or curated row already covers is kept.
 *
 * NBA.com logs one row per player per team. Rows are grouped into one
 * team-centric event, like ESPN's, and worded the way ESPN words them
 * ("Acquired ... from ... in exchange for ...") from NBA.com's own parts.
 * Nothing is added that the rows don't say. Coverage starts July 2015.
 */

import { createHash } from "node:crypto";

import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import {
  canonicalSeasonFromIsoDate,
  classifyEspnTransactionDescription,
} from "@/data/transformers/espn-transactions";
import {
  TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
  type CanonicalTransaction,
  type TransactionType,
} from "@/data/types/transaction-lineage";

export const NBA_MOVEMENT_SOURCE = "nba-player-movement";
export const NBA_MOVEMENT_DATASET_VERSION = "1.0";
export const NBA_MOVEMENT_URL = "https://stats.nba.com/js/data/playermovement/NBA_Player_Movement.json";
export const NBA_MOVEMENT_PUBLIC_URL = "https://www.nba.com/players/transactions";

export type NbaMovementRow = {
  Transaction_Type: string;
  TRANSACTION_DATE: string;
  TRANSACTION_DESCRIPTION: string;
  TEAM_ID: number;
  TEAM_SLUG?: string;
  PLAYER_ID: number;
  PLAYER_SLUG?: string;
  /** Trades: the team the item came from. */
  Additional_Sort?: number;
  GroupSort: string;
};

export async function fetchNbaMovementRows(): Promise<NbaMovementRow[]> {
  const response = await fetch(NBA_MOVEMENT_URL, {
    headers: {
      Referer: "https://www.nba.com/",
      "User-Agent": "Mozilla/5.0 (compatible; basketball-analytics transactions)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`NBA.com player movement HTTP ${response.status}`);
  const body = (await response.json()) as { NBA_Player_Movement?: { rows?: NbaMovementRow[] } };
  const rows = body.NBA_Player_Movement?.rows;
  if (!Array.isArray(rows) || rows.length < 1000) {
    throw new Error(`NBA.com player movement returned ${rows?.length ?? 0} rows`);
  }
  return rows;
}

const VERB = /\b(received|re-signed|signed|waived|claimed|converted)\b/;
const NAME_SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "");
}

/** Last name as it appears in folded ESPN text ("finney-smith" folds to "finneysmith", which contains "smith"). */
function lastNameKey(slug: string): string | null {
  const parts = fold(slug.replace(/-/g, " "))
    .split(" ")
    .filter((part) => part.length > 1 && !NAME_SUFFIX.has(part));
  return parts.at(-1) ?? null;
}

/** "Toronto Raptors re-signed forward X to a Contract." -> "Re-signed forward X to a Contract." */
function withoutTeamPrefix(description: string): string | null {
  const match = VERB.exec(description);
  if (!match) return null;
  const rest = description.slice(match.index).trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** "LA Clippers received guard Gradey Dick from Toronto Raptors." -> item + from team. */
function tradeItem(row: NbaMovementRow): { item: string; from: string | null } | null {
  const match = /\breceived (.+?)(?: from (.+?))?\.?$/.exec(row.TRANSACTION_DESCRIPTION.trim());
  if (!match) return null;
  return { item: match[1]!.trim(), from: match[2]?.trim() ?? null };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

type Group = {
  key: string;
  date: string;
  nbaTeamId: string;
  type: string;
  rows: NbaMovementRow[];
};

type EspnIndex = Map<string, { time: number; text: string; sentences: string[] }[]>;

function indexExisting(existing: CanonicalTransaction[]): EspnIndex {
  const byTeam: EspnIndex = new Map();
  for (const tx of existing) {
    const raw = tx.description ?? "";
    const entry = {
      time: Date.parse(tx.date),
      text: fold(raw),
      sentences: raw.split(/(?<=\.)\s+(?=[A-Z])/).map(fold),
    };
    for (const teamId of tx.teamIds.length ? tx.teamIds : [tx.parties[0]?.teamId ?? ""]) {
      if (!teamId) continue;
      const list = byTeam.get(teamId) ?? [];
      list.push(entry);
      byTeam.set(teamId, list);
    }
  }
  return byTeam;
}

/** Verbs that mark the same kind of move in ESPN's wording (folded text). */
const SAME_KIND: Record<string, RegExp> = {
  Signing: /\b(signed|resigned|extension|extended)\b/,
  Waive: /\b(waived|released)\b/,
  Trade: /\b(traded|acquired|exchange)\b/,
  AwardOnWaivers: /\bclaimed\b/,
  ContractConverted: /\bconverted\b/,
};
const NEAR_DAYS = 7;
const NEAR_TRADE_DAYS = 10;
const SAME_KIND_DAYS = 30;

export type NbaMovementBuildResult = {
  transactions: CanonicalTransaction[];
  groupCount: number;
  coveredCount: number;
  skipped: Record<string, number>;
};

/**
 * NBA.com moves that no existing row covers. A move counts as covered when an
 * existing row for the same team names one of its players by last name within
 * 7 days (10 for trades), or within 30 days in a sentence with the same kind
 * of verb (ESPN sometimes logs a signing weeks after NBA.com). Trades check
 * the players sent as well as received.
 */
export function buildNbaMovementGapTransactions(
  rows: NbaMovementRow[],
  existing: CanonicalTransaction[],
  options: { ingestedAt: string }
): NbaMovementBuildResult {
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  const groups = new Map<string, Group>();
  const tradeRows = new Map<string, NbaMovementRow[]>();
  for (const raw of rows) {
    const date = raw.TRANSACTION_DATE?.slice(0, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !raw.TRANSACTION_DESCRIPTION) {
      skip("malformed_row");
      continue;
    }
    const row = { ...raw, TRANSACTION_DESCRIPTION: raw.TRANSACTION_DESCRIPTION.replace(/\s+/g, " ").trim() };
    const nbaTeamId = String(row.TEAM_ID);
    const isTrade = row.Transaction_Type === "Trade";
    const key = isTrade ? `${row.GroupSort}|${date}|${nbaTeamId}` : `${row.GroupSort}|${date}|${nbaTeamId}|${row.PLAYER_ID}`;
    const group = groups.get(key) ?? { key, date, nbaTeamId, type: row.Transaction_Type, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
    if (isTrade) {
      const tradeKey = `${row.GroupSort}|${date}`;
      tradeRows.set(tradeKey, [...(tradeRows.get(tradeKey) ?? []), row]);
    }
  }

  const byTeam = indexExisting(existing);
  const transactions: CanonicalTransaction[] = [];
  let coveredCount = 0;

  for (const group of groups.values()) {
    const team = getCanonicalTeamFromProvider("nba", group.nbaTeamId);
    if (!team) {
      skip("unmapped_team");
      continue;
    }
    const isTrade = group.type === "Trade";
    const sent = isTrade
      ? (tradeRows.get(`${group.rows[0]!.GroupSort}|${group.date}`) ?? []).filter(
          (row) => String(row.Additional_Sort ?? "") === group.nbaTeamId
        )
      : [];
    const names = [...group.rows, ...sent]
      .map((row) => (row.PLAYER_ID && row.PLAYER_SLUG ? lastNameKey(row.PLAYER_SLUG) : null))
      .filter((name): name is string => Boolean(name));
    const time = Date.parse(group.date);
    const window = (isTrade ? NEAR_TRADE_DAYS : NEAR_DAYS) * 86_400_000;
    const teamRows = byTeam.get(team.canonicalTeamId) ?? [];
    const nearby = teamRows.filter((row) => Math.abs(row.time - time) <= window);
    const kind = SAME_KIND[group.type];
    const sameKindLater =
      kind &&
      names.some((name) =>
        teamRows.some(
          (row) =>
            Math.abs(row.time - time) <= SAME_KIND_DAYS * 86_400_000 &&
            row.sentences.some((sentence) => sentence.includes(name) && kind.test(sentence))
        )
      );
    if (sameKindLater || names.some((name) => nearby.some((row) => row.text.includes(name)))) {
      coveredCount += 1;
      continue;
    }
    if (!names.length && nearby.some((row) => /\b(traded|acquired)\b/.test(row.text))) {
      coveredCount += 1;
      continue;
    }

    let description: string | null;
    let type: TransactionType;
    if (isTrade) {
      const received = group.rows.map(tradeItem).filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (!received.length) {
        skip("unparsed_trade");
        continue;
      }
      const froms = [...new Set(received.map((x) => x.from).filter(Boolean))];
      const acquired =
        froms.length === 1
          ? `${joinList(received.map((x) => x.item))} from ${froms[0]}`
          : joinList(received.map((x) => (x.from ? `${x.item} from ${x.from}` : x.item)));
      const gave = sent.map(tradeItem).filter((x): x is NonNullable<typeof x> => Boolean(x)).map((x) => x.item);
      description = `Acquired ${acquired}${gave.length ? ` in exchange for ${joinList(gave)}` : ""}.`;
      type = "trade";
    } else {
      description = withoutTeamPrefix(group.rows[0]!.TRANSACTION_DESCRIPTION);
      if (!description) {
        skip("unparsed_description");
        continue;
      }
      type = /\bextension\b/i.test(description) ? "extension" : classifyEspnTransactionDescription(description);
    }

    const season = canonicalSeasonFromIsoDate(group.date);
    if (!season) {
      skip("unresolvable_season");
      continue;
    }
    const id = `nba-tx-${createHash("sha1").update(group.key).digest("hex").slice(0, 16)}`;
    transactions.push({
      id,
      date: group.date,
      season,
      type,
      status: "real",
      parties: [{ teamId: team.canonicalTeamId, teamAbbr: team.abbr }],
      teamIds: [team.canonicalTeamId],
      assets: [],
      source: NBA_MOVEMENT_SOURCE,
      sourceUrl: NBA_MOVEMENT_PUBLIC_URL,
      sourceVersion: NBA_MOVEMENT_DATASET_VERSION,
      methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
      description,
      provenance: {
        source: NBA_MOVEMENT_SOURCE,
        sourceRecordId: group.key,
        datasetVersion: NBA_MOVEMENT_DATASET_VERSION,
        ingestedAt: options.ingestedAt,
        rawTypeGuess: type,
      },
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { transactions, groupCount: groups.size, coveredCount, skipped };
}
