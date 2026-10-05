/**
 * Draft-night transactions: one row per selection.
 *
 * The transaction feed skips the draft itself and starts at the rookie
 * contract, so a drafted player's first move with his team would otherwise be
 * a July signing, and second-rounders who never sign would have no move at all.
 *
 * Dates come from the draft's published start and end times, which exist from
 * the 2025 draft on. Earlier drafts get no rows rather than a guessed date.
 */
import { getCanonicalTeamFromProvider } from "@/data/identity/team-map";
import { canonicalSeasonFromIsoDate } from "@/data/transformers/espn-transactions";
import { formatOrdinal as ordinal } from "@/lib/format";
import {
  TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
  type CanonicalTransaction,
} from "@/data/types/transaction-lineage";

export const ESPN_DRAFT_SOURCE = "espn-draft";
export const ESPN_DRAFT_DATASET_VERSION = "1.0";
/** First draft with published start/end times. */
export const ESPN_DRAFT_FIRST_DATED_YEAR = 2025;

export type DraftNights = {
  year: number;
  /** ISO instant the draft opened (round 1). */
  startDate: string;
  /** ISO instant the draft closed (last round). */
  endDate: string;
};

export type DraftSelection = {
  year: number;
  round: number;
  roundPick: number;
  overall: number;
  /** Team that made the pick. */
  espnTeamId: string;
  /** Id inside the draft feed, stable for the pick. */
  draftAthleteId: string;
  /** Site player id when the feed links one. */
  playerId: string | null;
  name: string;
  /** Position abbreviation (G, F, C). */
  position: string | null;
};

const EASTERN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date in US Eastern time, where the draft is held. */
export function easternDate(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return EASTERN.format(new Date(ms));
}

/** Round 1 is the opening night; later rounds go on the closing night. */
export function draftRoundDate(nights: DraftNights, round: number): string | null {
  const open = easternDate(nights.startDate);
  const close = easternDate(nights.endDate);
  if (!open) return null;
  if (round <= 1 || !close || close < open) return open;
  return close;
}

export function draftDescription(sel: Pick<DraftSelection, "name" | "position" | "overall" | "year">): string {
  const who = sel.position ? `${sel.position} ${sel.name}` : sel.name;
  return `Drafted ${who} with the ${ordinal(sel.overall)} overall pick in the ${sel.year} NBA Draft.`;
}

export function draftTransactionId(year: number, overall: number): string {
  return `espn-draft-${year}-${String(overall).padStart(2, "0")}`;
}

export function draftSourceRecordId(sel: Pick<DraftSelection, "year" | "overall" | "draftAthleteId">): string {
  return `${sel.year}:${sel.overall}:${sel.draftAthleteId}`;
}

export function buildDraftTransactions(
  nights: DraftNights,
  selections: DraftSelection[],
  { ingestedAt }: { ingestedAt: string }
): { transactions: CanonicalTransaction[]; skipped: Record<string, number> } {
  const transactions: CanonicalTransaction[] = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  for (const sel of [...selections].sort((a, b) => a.overall - b.overall)) {
    const team = getCanonicalTeamFromProvider("espn", sel.espnTeamId);
    if (!team) {
      skip("unknown-team");
      continue;
    }
    const name = sel.name.trim();
    if (!name) {
      skip("no-name");
      continue;
    }
    const date = draftRoundDate(nights, sel.round);
    const season = date ? canonicalSeasonFromIsoDate(date) : null;
    if (!date || !season) {
      skip("no-date");
      continue;
    }
    const teamId = team.canonicalTeamId;
    transactions.push({
      id: draftTransactionId(sel.year, sel.overall),
      date,
      season,
      type: "draft",
      status: "real",
      parties: [{ teamId, teamAbbr: team.abbr }],
      teamIds: [teamId],
      assets: [
        {
          asset: {
            id: sel.playerId ? `player:${sel.playerId}` : `draft:${sel.year}:${sel.overall}`,
            type: "player",
            label: name,
            ...(sel.playerId ? { playerId: sel.playerId } : {}),
            playerName: name,
            draftPick: {
              draftYear: sel.year,
              ...(sel.round === 1 || sel.round === 2 ? { round: sel.round } : {}),
              pickNumber: sel.overall,
              currentOwnerTeamId: teamId,
              conveyed: true,
            },
            metadata: { roundPick: sel.roundPick, position: sel.position },
            methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
          },
          direction: "incoming",
          teamId,
        },
      ],
      source: ESPN_DRAFT_SOURCE,
      sourceVersion: ESPN_DRAFT_DATASET_VERSION,
      methodologyVersion: TRANSACTION_LINEAGE_METHODOLOGY_VERSION,
      description: draftDescription({ ...sel, name }),
      provenance: {
        source: ESPN_DRAFT_SOURCE,
        sourceRecordId: draftSourceRecordId(sel),
        datasetVersion: ESPN_DRAFT_DATASET_VERSION,
        ingestedAt,
        rawTypeGuess: "draft",
      },
    });
  }
  return { transactions, skipped };
}

/** Selection back out of a stored row, so reruns skip refetching known picks. */
export function selectionFromTransaction(tx: CanonicalTransaction): DraftSelection | null {
  const asset = tx.assets[0]?.asset;
  const pick = asset?.draftPick;
  const [, , draftAthleteId] = String(tx.provenance?.sourceRecordId ?? "").split(":");
  if (!asset || !pick?.pickNumber || !draftAthleteId) return null;
  const roundPick = Number(asset.metadata?.roundPick);
  const position = asset.metadata?.position;
  return {
    year: pick.draftYear,
    round: pick.round ?? 0,
    roundPick: Number.isFinite(roundPick) ? roundPick : 0,
    overall: pick.pickNumber,
    espnTeamId: tx.teamIds[0] ?? "",
    draftAthleteId,
    playerId: asset.playerId ?? null,
    name: asset.playerName ?? asset.label,
    position: typeof position === "string" ? position : null,
  };
}
