/**
 * How a team got a player, from ESPN transaction rows.
 *
 * Every row becomes moves (trade receipts, draft signings, signings, claims,
 * waivers). A player's time with a team is a stint: it opens on an arrival
 * and closes on the first move that takes him elsewhere. Re-signings and the
 * partner team's copy of the same trade never open a second stint.
 *
 * Pure: callers pass rows plus identity and draft lookups.
 */

import { NON_PLAYER_ASSET, parseRosterMoves, parseTradeText } from "@/lib/espn-ledger-text";
import type {
  AcquisitionStint,
  AcquisitionStory,
  Arrival,
  Departure,
  DraftCandidate,
  DraftedBy,
  DraftSlot,
  ForwardNode,
  OriginNode,
  PathAsset,
  PathDeal,
  TeamAcquisitionEntry,
} from "@/trades/acquisition-types";

export type LedgerEvent = { id: string; date: string; teamId: string; description: string };

export type EngineDeps = {
  playerFor: (label: string, date: string) => { playerId: string; name: string } | null;
  draftOf: (playerId: string) => (DraftSlot & { teamId?: string }) | null;
  draftedBy: (teamId: string, year: number, round: number) => DraftCandidate[];
  /** Drafted players, so ones the log never mentions still get a draft arrival. */
  draftees?: Array<{ playerId: string; name: string }>;
  currentTeamOf: (playerId: string) => string | null;
  /** Latest draft that has happened. */
  lastDraftYear: number;
};

type MoveKind = "trade" | "draft" | "signing" | "re-signing" | "claim" | "waive";

type Move = {
  eventId: string;
  date: string;
  kind: MoveKind;
  /** Receiving (trade) or acting team; null when a trade row names no receiver. */
  teamId: string | null;
  fromTeamId?: string;
  asset: PathAsset;
  synthetic?: true;
};

type Stint = { start: string; arrival: Move; end?: Move };

const ARRIVAL_KINDS = new Set<MoveKind>(["trade", "draft", "signing", "claim"]);
const MAX_FORWARD_DEPTH = 5;
const MAX_ORIGIN_DEPTH = 3;
const NODE_BUDGET = 90;

function looseKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function pickKey(label: string): string | null {
  if (/\bswaps?\b/i.test(label)) return null;
  const years = label.match(/\b(?:19|20)\d{2}\b/g);
  if (!years || years.length !== 1) return null;
  const round = /\b(first|1st)\b/i.test(label) ? 1 : /\b(second|2nd)\b/i.test(label) ? 2 : 0;
  if (!round || /\b(two|three|four|picks)\b/i.test(label)) return null;
  return `pick:${years[0]}:${round}`;
}

function withoutFrom(asset: PathAsset & { fromTeamId?: string }): PathAsset {
  const copy = { ...asset };
  delete copy.fromTeamId;
  return copy;
}

function stintHow(kind: MoveKind): AcquisitionStint["how"] {
  return kind === "re-signing" ? "first-seen" : (kind as AcquisitionStint["how"]);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type AcquisitionEngine = ReturnType<typeof createAcquisitionEngine>;

export function createAcquisitionEngine(events: LedgerEvent[], deps: EngineDeps) {
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const eventsByDate = new Map<string, LedgerEvent[]>();
  for (const e of events) eventsByDate.set(e.date, [...(eventsByDate.get(e.date) ?? []), e]);

  const assetFor = (label: string, date: string, eventId: string): PathAsset => {
    if (NON_PLAYER_ASSET.test(label)) {
      return { label, key: pickKey(label) ?? `x:${eventId}:${looseKey(label)}`, nonPlayer: true };
    }
    const player = deps.playerFor(label, date);
    if (player) return { label: player.name, key: `p:${player.playerId}`, playerId: player.playerId };
    return { label, key: `n:${looseKey(label)}` };
  };

  const byKey = new Map<string, Move[]>();
  const tradesByEvent = new Map<string, Move[]>();
  const add = (move: Move) => {
    byKey.set(move.asset.key, [...(byKey.get(move.asset.key) ?? []), move]);
    if (move.kind === "trade") {
      tradesByEvent.set(move.eventId, [...(tradesByEvent.get(move.eventId) ?? []), move]);
    }
  };

  for (const e of events) {
    for (const r of parseTradeText(e.description, e.teamId)) {
      add({
        eventId: e.id,
        date: e.date,
        kind: "trade",
        teamId: r.teamId,
        ...(r.fromTeamId ? { fromTeamId: r.fromTeamId } : {}),
        asset: assetFor(r.label, e.date, e.id),
      });
    }
    for (const m of parseRosterMoves(e.description)) {
      add({ eventId: e.id, date: e.date, kind: m.kind, teamId: e.teamId, asset: assetFor(m.label, e.date, e.id) });
    }
  }

  // Draft-night arrivals the log often skips: baked draft data names the team.
  const players = new Map<string, PathAsset>();
  for (const [key, moves] of byKey) if (moves[0]?.asset.playerId) players.set(key, moves[0].asset);
  for (const d of deps.draftees ?? []) {
    const key = `p:${d.playerId}`;
    if (!players.has(key)) players.set(key, { label: d.name, key, playerId: d.playerId });
  }
  for (const [key, asset] of players) {
    const draft = deps.draftOf(asset.playerId!);
    if (!draft?.teamId) continue;
    const logged = (byKey.get(key) ?? []).some(
      (m) => m.kind === "draft" && m.date.startsWith(`${draft.year}-06`)
    );
    if (logged) continue;
    byKey.set(key, [
      ...(byKey.get(key) ?? []),
      { eventId: "", date: `${draft.year}-06-26`, kind: "draft", teamId: draft.teamId, asset, synthetic: true },
    ]);
  }
  for (const moves of byKey.values()) {
    moves.sort((a, b) => a.date.localeCompare(b.date) || Number(!!b.synthetic) - Number(!!a.synthetic));
  }

  function leavesTeam(m: Move, teamId: string): boolean {
    // Pick keys are shared league-wide (every team has a 2014 first), so only
    // this team sending one counts.
    if (m.asset.key.startsWith("pick:")) return m.kind === "trade" && m.fromTeamId === teamId;
    if (m.kind === "trade") return m.fromTeamId === teamId || (m.teamId !== null && m.teamId !== teamId);
    if (m.kind === "waive") return m.teamId === teamId;
    return m.teamId !== teamId;
  }

  function stintsFor(teamId: string, key: string): Stint[] {
    const out: Stint[] = [];
    let open: Stint | null = null;
    for (const m of byKey.get(key) ?? []) {
      const arrives = ARRIVAL_KINDS.has(m.kind) && m.teamId === teamId;
      if (!open) {
        if (arrives || (m.kind === "re-signing" && m.teamId === teamId)) open = { start: m.date, arrival: m };
        continue;
      }
      if (arrives || m.eventId === open.arrival.eventId) continue;
      if (m.kind === "trade" && open.arrival.kind === "trade" && sameDeal(open.arrival, m)) continue;
      if (leavesTeam(m, teamId)) {
        open.end = m;
        out.push(open);
        open = null;
      }
    }
    if (open) out.push(open);
    return out;
  }

  function sameDeal(a: Move, b: Move): boolean {
    return dealFor(a).eventIds.includes(b.eventId);
  }

  type FullDeal = PathDeal & {
    outgoing: Array<PathAsset & { fromTeamId: string }>;
    fromByKey: Map<string, string | undefined>;
  };
  const dealCache = new Map<string, FullDeal>();

  function dealFor(m: Move): FullDeal {
    const hit = dealCache.get(m.eventId);
    if (hit) return hit;
    const source = eventsById.get(m.eventId);
    const sourceMoves = tradesByEvent.get(m.eventId) ?? [];
    const teams = new Set<string>();
    for (const t of sourceMoves) {
      if (t.teamId) teams.add(t.teamId);
      if (t.fromTeamId) teams.add(t.fromTeamId);
    }
    const rows: LedgerEvent[] = source ? [source] : [];
    if (source) {
      for (const day of [-1, 0, 1]) {
        for (const e of eventsByDate.get(shiftDate(source.date, day)) ?? []) {
          if (e.id === source.id || !teams.has(e.teamId)) continue;
          const touches = (tradesByEvent.get(e.id) ?? []).some(
            (t) => t.teamId === source.teamId || t.fromTeamId === source.teamId
          );
          if (touches) rows.push(e);
        }
      }
    }

    const own = new Map<string, Set<string>>();
    for (const e of rows) {
      const keys = own.get(e.teamId) ?? new Set<string>();
      for (const t of tradesByEvent.get(e.id) ?? []) if (t.teamId === e.teamId) keys.add(t.asset.key);
      own.set(e.teamId, keys);
    }

    const sides = new Map<string, Map<string, PathAsset & { fromTeamId?: string }>>();
    const sideFor = (teamId: string) => {
      if (!sides.has(teamId)) sides.set(teamId, new Map());
      return sides.get(teamId)!;
    };
    for (const e of rows) sideFor(e.teamId);
    const unconfirmed: NonNullable<PathDeal["unconfirmed"]> = [];
    const outgoing: Array<PathAsset & { fromTeamId: string }> = [];

    for (const e of rows) {
      for (const t of tradesByEvent.get(e.id) ?? []) {
        if (t.fromTeamId) sideFor(t.fromTeamId);
        if (t.teamId === null) {
          if (t.fromTeamId) outgoing.push({ ...t.asset, fromTeamId: t.fromTeamId });
          continue;
        }
        const receiverRow = own.get(t.teamId);
        if (t.teamId !== e.teamId && receiverRow && !receiverRow.has(t.asset.key)) {
          unconfirmed.push({ ...t.asset, claimedByTeamId: e.teamId, toTeamId: t.teamId });
          continue;
        }
        const side = sideFor(t.teamId);
        const existing = side.get(t.asset.key);
        if (!existing) side.set(t.asset.key, { ...t.asset, ...(t.fromTeamId ? { fromTeamId: t.fromTeamId } : {}) });
        else if (!existing.fromTeamId && t.fromTeamId) existing.fromTeamId = t.fromTeamId;
      }
    }

    for (const o of outgoing) {
      const others = [...sides.keys()].filter((t) => t !== o.fromTeamId);
      if (others.length !== 1) continue;
      const side = sideFor(others[0]!);
      if (!side.has(o.key)) side.set(o.key, { ...o });
    }

    const deal = {
      date: source?.date ?? m.date,
      eventIds: rows.map((e) => e.id),
      sides: [...sides.entries()].map(([teamId, assets]) => ({
        teamId,
        receives: [...assets.values()]
          .map((asset) => withoutFrom(asset))
          .sort((a, b) => Number(!!a.nonPlayer) - Number(!!b.nonPlayer)),
      })),
      ...(unconfirmed.length ? { unconfirmed } : {}),
      outgoing,
      fromByKey: new Map(
        [...sides.entries()].flatMap(([teamId, assets]) =>
          [...assets.values()].map((a) => [`${teamId}|${a.key}`, a.fromTeamId] as const)
        )
      ),
    };
    dealCache.set(m.eventId, deal);
    return deal;
  }

  function publicDeal(deal: ReturnType<typeof dealFor>): PathDeal {
    return {
      date: deal.date,
      eventIds: deal.eventIds,
      sides: deal.sides,
      ...(deal.unconfirmed ? { unconfirmed: deal.unconfirmed } : {}),
    };
  }

  function ownTradeRowNear(teamId: string, date: string): Move | undefined {
    for (const day of [0, -1, 1]) {
      for (const e of eventsByDate.get(shiftDate(date, day)) ?? []) {
        if (e.teamId !== teamId) continue;
        const own = (tradesByEvent.get(e.id) ?? []).find((t) => t.teamId === teamId);
        if (own) return own;
      }
    }
    return undefined;
  }

  /** What `teamId` sent out in a deal. */
  function gaveIn(deal: ReturnType<typeof dealFor>, teamId: string): PathAsset[] {
    const twoTeam = deal.sides.length === 2;
    const out: PathAsset[] = [];
    for (const side of deal.sides) {
      if (side.teamId === teamId) continue;
      for (const asset of side.receives) {
        const from = deal.fromByKey.get(`${side.teamId}|${asset.key}`);
        if (from === teamId || (!from && twoTeam)) out.push(asset);
      }
    }
    for (const asset of deal.outgoing) {
      if (asset.fromTeamId === teamId && !out.some((a) => a.key === asset.key)) {
        out.push(withoutFrom(asset));
      }
    }
    return out;
  }

  function arrivalOf(stint: Stint, teamId: string): Arrival {
    const m = stint.arrival;
    if (m.kind === "trade") {
      const deal = dealFor(m);
      return {
        how: "trade",
        date: m.date,
        eventId: m.eventId,
        ...(m.fromTeamId ? { fromTeamId: m.fromTeamId } : {}),
        deal: publicDeal(deal),
        gave: gaveIn(deal, teamId),
      };
    }
    const drafted = draftedElsewhere(m, teamId);
    const extra = drafted ? { draftedBy: drafted } : {};
    if (m.kind === "draft") {
      const draft = m.asset.playerId ? deps.draftOf(m.asset.playerId) : null;
      const slot = draft && draft.teamId === teamId ? { year: draft.year, round: draft.round, pick: draft.pick } : undefined;
      return {
        how: "draft",
        date: m.date,
        ...(m.synthetic ? {} : { eventId: m.eventId }),
        ...(slot ? { draft: slot } : {}),
        ...extra,
      };
    }
    if (m.kind === "re-signing") return { how: "first-seen", date: m.date, eventId: m.eventId, ...extra };
    if (m.kind === "claim") return { how: "claim", date: m.date, eventId: m.eventId };
    return { how: "signing", date: m.date, eventId: m.eventId, ...extra };
  }

  /**
   * Another team's pick whose first logged move is with this team (a rookie
   * deal, an early signing or a later re-signing), so his rights moved in a
   * deal the log never shows.
   */
  function draftedElsewhere(m: Move, teamId: string): DraftedBy | undefined {
    const playerId = m.asset.playerId;
    if (!playerId || m.synthetic || m.kind === "claim") return undefined;
    const draft = deps.draftOf(playerId);
    if (!draft?.teamId || draft.teamId === teamId) return undefined;
    if (byKey.get(m.asset.key)?.find((x) => !x.synthetic) !== m) return undefined;
    if (m.kind === "signing" && m.date >= `${draft.year + 1}-07-01`) return undefined;
    // A swap only reads as one while both players could still be on rookie deals.
    const rookieWindow = `${draft.year + 4}-07-01`;
    const swappedFor =
      m.date < rookieWindow
        ? [1, 2]
            .flatMap((round) => deps.draftedBy(teamId, draft.year, round))
            .filter((c) => {
              const first = c.playerId ? byKey.get(`p:${c.playerId}`)?.find((x) => !x.synthetic) : undefined;
              return !!first && first.teamId === draft.teamId && first.date < rookieWindow;
            })
        : [];
    return {
      teamId: draft.teamId,
      year: draft.year,
      round: draft.round,
      pick: draft.pick,
      ...(swappedFor.length ? { swappedFor } : {}),
    };
  }

  function departureOf(m: Move | undefined, teamId: string, asset: PathAsset): Departure {
    if (m) {
      if (m.kind === "trade") {
        const deal = dealFor(m);
        const inDeal = deal.sides.some((s) => s.teamId === teamId);
        if (m.fromTeamId === teamId || inDeal) {
          return {
            how: "trade",
            date: m.date,
            eventId: m.eventId,
            ...(m.teamId ? { toTeamId: m.teamId } : {}),
            deal: publicDeal(deal),
            got: deal.sides.find((s) => s.teamId === teamId)?.receives ?? [],
          };
        }
        // Neither row names the other team; this team's own trade row that
        // week is the other half.
        const ownRow = m.fromTeamId ? undefined : ownTradeRowNear(teamId, m.date);
        if (ownRow) {
          const own = dealFor(ownRow);
          const merged: PathDeal = {
            date: m.date,
            eventIds: [...new Set([...deal.eventIds, ...own.eventIds])],
            sides: [
              ...own.sides,
              ...deal.sides.filter((s) => !own.sides.some((o) => o.teamId === s.teamId)),
            ],
            ...(deal.unconfirmed || own.unconfirmed
              ? { unconfirmed: [...(own.unconfirmed ?? []), ...(deal.unconfirmed ?? [])] }
              : {}),
          };
          return {
            how: "trade",
            date: m.date,
            eventId: m.eventId,
            ...(m.teamId ? { toTeamId: m.teamId } : {}),
            deal: merged,
            got: own.sides.find((s) => s.teamId === teamId)?.receives ?? [],
          };
        }
        return m.teamId
          ? { how: "next-seen", date: m.date, eventId: m.eventId, teamId: m.teamId }
          : { how: "unknown" };
      }
      if (m.kind === "waive") return { how: "waived", date: m.date, eventId: m.eventId };
      if (m.teamId && (m.kind === "signing" || m.kind === "claim")) {
        return { how: "left", date: m.date, eventId: m.eventId, toTeamId: m.teamId, via: m.kind };
      }
      if (m.teamId) return { how: "next-seen", date: m.date, eventId: m.eventId, teamId: m.teamId };
      return { how: "unknown" };
    }
    if (asset.key.startsWith("pick:")) {
      const [, year, round] = asset.key.split(":");
      const y = Number(year);
      if (y > deps.lastDraftYear) return { how: "pending", year: y };
      return { how: "used", year: y, round: Number(round), candidates: deps.draftedBy(teamId, y, Number(round)) };
    }
    if (asset.playerId && deps.currentTeamOf(asset.playerId) === teamId) return { how: "here" };
    return { how: "unknown" };
  }

  type Budget = { left: number; truncated: boolean; expanded: Set<string> };

  const dealId = (deal: PathDeal) => [...deal.eventIds].sort().join("|");
  const traceable = (a: PathAsset) => !!a.playerId || a.key.startsWith("pick:") || a.key.startsWith("n:");

  function forward(teamId: string, asset: PathAsset, since: string, depth: number, budget: Budget, end?: Move): ForwardNode {
    budget.left -= 1;
    const exit = end ?? (asset.nonPlayer && !asset.key.startsWith("pick:") ? undefined : nextExit(teamId, asset.key, since));
    const departure =
      asset.nonPlayer && !asset.key.startsWith("pick:") ? ({ how: "unknown" } as Departure) : departureOf(exit, teamId, asset);
    const next: ForwardNode[] = [];
    if (departure.how === "trade") {
      if (depth >= MAX_FORWARD_DEPTH || budget.left <= 0) {
        if (departure.got.length) budget.truncated = true;
      } else {
        for (const got of departure.got.filter(traceable)) {
          if (budget.left <= 0) {
            budget.truncated = true;
            break;
          }
          next.push(forward(teamId, got, departure.date, depth + 1, budget));
        }
      }
    }
    return { asset, teamId, since, departure, next };
  }

  /** First move after `since` that takes the asset away from the team. */
  function nextExit(teamId: string, key: string, since: string): Move | undefined {
    const arrivalEvents = new Set<string>();
    for (const m of byKey.get(key) ?? []) {
      if (m.date < since) continue;
      if (m.date === since && m.kind === "trade" && m.teamId === teamId) {
        for (const id of dealFor(m).eventIds) arrivalEvents.add(id);
        continue;
      }
      if (arrivalEvents.has(m.eventId)) continue;
      if (m.date === since && m.teamId === teamId) continue;
      if (leavesTeam(m, teamId)) return m;
    }
    return undefined;
  }

  function origin(teamId: string, asset: PathAsset, before: string, depth: number, budget: Budget): OriginNode {
    budget.left -= 1;
    const stint = [...stintsFor(teamId, asset.key)].reverse().find((s) => s.start < before);
    const arrival: Arrival = stint ? arrivalOf(stint, teamId) : { how: "unknown" };
    const origins: OriginNode[] = [];
    if (arrival.how === "trade" && budget.expanded.has(dealId(arrival.deal))) {
      return { asset, teamId, arrival, origins, repeat: true };
    }
    if (arrival.how === "trade") budget.expanded.add(dealId(arrival.deal));
    if (arrival.how === "trade" && arrival.gave.length) {
      if (depth >= MAX_ORIGIN_DEPTH || budget.left <= 0) budget.truncated = true;
      else {
        for (const gave of arrival.gave.filter(traceable)) {
          if (budget.left <= 0) {
            budget.truncated = true;
            break;
          }
          origins.push(origin(teamId, gave, arrival.date, depth + 1, budget));
        }
      }
    }
    return { asset, teamId, arrival, origins };
  }

  function stintSummary(stints: Stint[]): AcquisitionStint[] {
    return stints
      .map((s) => ({
        start: s.start,
        how: stintHow(s.arrival.kind),
        ...(s.end ? { end: s.end.date } : {}),
      }))
      .reverse();
  }

  function story(teamId: string, key: string, since?: string): AcquisitionStory | null {
    const stints = stintsFor(teamId, key);
    if (!stints.length) return null;
    const stint = (since ? stints.find((s) => s.start === since) : null) ?? stints[stints.length - 1]!;
    const arrival = arrivalOf(stint, teamId);
    const budget: Budget = { left: NODE_BUDGET, truncated: false, expanded: new Set() };
    const afterwards = forward(teamId, stint.arrival.asset, stint.start, 0, budget, stint.end);
    if (arrival.how === "trade") budget.expanded.add(dealId(arrival.deal));
    const origins =
      arrival.how === "trade" ? arrival.gave.filter(traceable).map((a) => origin(teamId, a, arrival.date, 1, budget)) : [];
    return {
      teamId,
      player: stint.arrival.asset,
      arrival,
      origins,
      afterwards,
      stints: stintSummary(stints),
      truncated: budget.truncated,
    };
  }

  function teamCatalog(teamId: string): TeamAcquisitionEntry[] {
    const keys = new Set<string>();
    for (const [key, moves] of byKey) {
      if (moves[0]?.asset.nonPlayer) continue;
      if (moves.some((m) => m.teamId === teamId && (ARRIVAL_KINDS.has(m.kind) || m.kind === "re-signing"))) {
        keys.add(key);
      }
    }
    const out: TeamAcquisitionEntry[] = [];
    for (const key of keys) {
      const stints = stintsFor(teamId, key);
      stints.forEach((s, i) => {
        const asset = s.arrival.asset;
        const onRoster =
          i === stints.length - 1 && !s.end && !!asset.playerId && deps.currentTeamOf(asset.playerId) === teamId;
        out.push({
          label: asset.label,
          key,
          ...(asset.playerId ? { playerId: asset.playerId } : {}),
          date: s.start,
          how: stintHow(s.arrival.kind),
          onRoster,
        });
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));
  }

  /** The newest arrival for a player with a team, for one-line summaries. */
  function latestArrival(teamId: string, key: string): Arrival | null {
    const stints = stintsFor(teamId, key);
    const last = stints[stints.length - 1];
    return last ? arrivalOf(last, teamId) : null;
  }

  return { story, teamCatalog, latestArrival };
}
