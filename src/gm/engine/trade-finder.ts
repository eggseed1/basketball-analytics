/** Trade Finder: complete the user's selected assets rather than requiring one player.
 * All displayed offers pass the real salary, Stepien, ownership and CPU acceptance evaluator.
 * Search is intentionally bounded so it remains responsive on the trade desk.
 */
import type { GmLeagueState, GmTradeAsset, GmPlayer, GmDraftPick } from "@/gm/types";
import { boardValue, evaluateTrade, type PlayerPackage } from "@/gm/engine/trades";
import { playerTradePoints, pickTradePoints } from "@/gm/engine/value";

type Assets = GmTradeAsset[];
const assetKey = (asset: GmTradeAsset) => asset.type + ":" + (asset.type === "cash" ? "cash" : asset.id);
const keyOf = (assets: Assets) => assets.map(assetKey).sort().join("|");

function availableBundles(league: GmLeagueState, teamId: string): Assets[] {
  const club = league.teams.find(team => team.id === teamId);
  if (!club) return [];
  const blocked = new Set(club.untouchables ?? []);
  // Price and salary variety: the original one-player finder only looked at ten top-valued players.
  const roster = league.players.filter(player =>
    player.teamId === teamId && player.contract && !blocked.has(player.id));
  const strongest = [...roster].sort((a, b) => playerTradePoints(b, league) - playerTradePoints(a, league)).slice(0, 10);
  const matching = [...roster].sort((a, b) =>
    (b.contract?.annualSalaryM ?? 0) - (a.contract?.annualSalaryM ?? 0)).slice(0, 6);
  const players = [...new Map([...strongest, ...matching].map(player => [player.id, player])).values()];
  const picks = club.draftPicks.filter(pick => !pick.frozen && pick.season >= league.season)
    .sort((a, b) => pickTradePoints(league, b) - pickTradePoints(league, a)).slice(0, 7);
  const pa = (player: GmPlayer): GmTradeAsset => ({ type: "player", id: player.id });
  const ka = (pick: GmDraftPick): GmTradeAsset => ({ type: "pick", id: pick.id });
  const bundles: Assets[] = [];
  for (const player of players) bundles.push([pa(player)]);
  for (const pick of picks) bundles.push([ka(pick)]);
  // Roster + salary matches, futures-only swaps, and three-asset sweeteners.
  for (let i = 0; i < Math.min(players.length, 10); i++) {
    for (let j = i + 1; j < Math.min(players.length, 10); j++) bundles.push([pa(players[i]!), pa(players[j]!)]);
  }
  for (let i = 0; i < Math.min(picks.length, 6); i++) {
    for (let j = i + 1; j < Math.min(picks.length, 6); j++) bundles.push([ka(picks[i]!), ka(picks[j]!)]);
  }
  for (const player of players.slice(0, 10)) {
    for (const pick of picks.slice(0, 6)) bundles.push([pa(player), ka(pick)]);
  }
  for (let i = 0; i < Math.min(players.length, 5); i++) {
    for (let j = i + 1; j < Math.min(players.length, 5); j++) {
      for (const pick of picks.slice(0, 3)) bundles.push([pa(players[i]!), pa(players[j]!), ka(pick)]);
    }
  }
  for (const player of players.slice(0, 5)) {
    for (let i = 0; i < Math.min(picks.length, 4); i++) {
      for (let j = i + 1; j < Math.min(picks.length, 4); j++) {
        bundles.push([pa(player), ka(picks[i]!), ka(picks[j]!)]);
      }
    }
  }
  return bundles;
}

function validSelection(league: GmLeagueState, teamId: string, assets: Assets): boolean {
  if (assets.length > 9) return false;
  const seen = new Set<string>();
  const club = league.teams.find(team => team.id === teamId);
  if (!club) return false;
  for (const asset of assets) {
    const key = assetKey(asset);
    if (seen.has(key)) return false;
    seen.add(key);
    if (asset.type === "player" &&
      (!league.players.some(p => p.id === asset.id && p.teamId === teamId && p.contract) ||
        (club.untouchables ?? []).includes(asset.id))) return false;
    if (asset.type === "pick" &&
      !club.draftPicks.some(p => p.id === asset.id && p.ownerTeamId === teamId && !p.frozen)) return false;
    if (asset.type === "cash" && (!(asset.cashM && asset.cashM > 0) || !Number.isFinite(asset.cashM))) return false;
  }
  return true;
}

function withAdditions(locked: Assets, candidates: Assets[], limit: number): Assets[] {
  const used = new Set(locked.map(assetKey));
  const variants = [locked];
  if (locked.length >= 9) return variants;
  for (const candidate of candidates) {
    if (candidate.length + locked.length > 9 ||
        candidate.some(asset => used.has(assetKey(asset)))) continue;
    variants.push([...locked, ...candidate]);
    if (variants.length > limit) break;
  }
  return variants;
}

function starterPackages(league: GmLeagueState, userTeamId: string, candidates: Assets[]): Assets[] {
  const team = league.teams.find(club => club.id === userTeamId);
  const onBlock = new Set(team?.tradeBlock ?? []);
  const singles = candidates.filter(bundle => bundle.length === 1);
  const blocks = singles.filter(bundle => bundle.some(asset => onBlock.has(asset.id)));
  const playerSingles = singles.filter(bundle => bundle[0]?.type === "player");
  const pickSingles = singles.filter(bundle => bundle[0]?.type === "pick");
  const mixed = candidates.filter(bundle => bundle.length === 2 &&
    bundle.some(a => a.type === "player") && bundle.some(a => a.type === "pick"));
  return [...new Map([...blocks, ...playerSingles.slice(-5), ...pickSingles.slice(0, 3),
    ...mixed.slice(0, 4)].map(bundle => [keyOf(bundle), bundle])).values()].slice(0, 14);
}

type Match = PlayerPackage & { score: number; signature: string };
function findForPartner(
  league: GmLeagueState, userTeamId: string, partnerId: string,
  lockedSend: Assets, lockedReceive: Assets, myBundles: Assets[],
  otherBundles: Assets[],
): Match[] {
  const found = new Map<string, Match>();
  const consider = (send: Assets, receive: Assets) => {
    const signature = keyOf(send) + "=>" + keyOf(receive);
    if (found.has(signature)) return;
    const result = evaluateTrade(league, userTeamId, partnerId, send, receive);
    if (!result.ok) return;
    // Do not recommend a gross overpay simply because the CPU accepts it.
    const cost = boardValue(league, userTeamId, send);
    const returnValue = boardValue(league, userTeamId, receive);
    if (cost > 0 && returnValue < cost * 0.66) return;
    const ratio = (returnValue + 4) / (cost + 4);
    const score = 100 - 50 * Math.abs(Math.log(ratio)) -
      2.3 * (send.length + receive.length) +
      (receive.some(a => a.type === "player") ? 2 : 0);
    found.set(signature, { partnerId, youSend: send, youReceive: receive, score, signature });
  };
  const scan = (sending: Assets[], receiving: Assets[]) => {
    for (const send of sending) {
      for (const receive of receiving) {
        consider(send, receive);
        if (found.size >= 18) return;
      }
    }
  };
  // First respect every checked asset exactly. A single selected pick or
  // a player-and-pick package is a valid starting point.
  const sendFirst = lockedSend.length ? [lockedSend] :
    lockedReceive.length ? myBundles : starterPackages(league, userTeamId, myBundles);
  const receiveFirst = lockedReceive.length ? [lockedReceive] : otherBundles;
  scan(sendFirst, receiveFirst);

  // A rigid package may need a second salary, pick or complementary player.
  // Only broaden when needed, to avoid making each button click expensive.
  if (found.size < 2 && (lockedSend.length || lockedReceive.length)) {
    const sends = lockedSend.length ? withAdditions(lockedSend, myBundles, 22) : myBundles;
    const receives = lockedReceive.length ? withAdditions(lockedReceive, otherBundles, 20) : otherBundles;
    // Limit the cross-product when one side is completely unselected.
    scan(sends.slice(0, lockedSend.length ? 23 : 170),
      receives.slice(0, lockedReceive.length ? 21 : lockedSend.length ? 85 : 170));
  }
  return [...found.values()].sort((a, b) => b.score - a.score);
}

/**
 * Finder input is the exact two-sided selection in the Trade Machine.
 * With only outgoing assets it calls every club; with incoming assets it
 * respects their owner. With neither selected it proposes sensible starters.
 * No possible deal is invented or forced through the CPU's acceptance rules.
 */
export function findSelectedTradePackages(
  league: GmLeagueState, userTeamId: string,
  youSend: GmTradeAsset[], youReceive: GmTradeAsset[],
  selectedPartnerId?: string,
): PlayerPackage[] {
  if (league.tradeDeadlinePassed || league.phase !== "regular") return [];
  if (!validSelection(league, userTeamId, youSend)) return [];
  const otherTeams = league.teams.filter(team =>
    team.id !== userTeamId && !team.id.startsWith("as-"));
  const receivingOwners = new Set(youReceive.flatMap(asset => {
    if (asset.type === "player") return league.players.find(p => p.id === asset.id)?.teamId ?? [];
    if (asset.type === "pick") return league.teams.find(t => t.draftPicks.some(p => p.id === asset.id))?.id ?? [];
    return selectedPartnerId ? [selectedPartnerId] : [];
  }));
  if (receivingOwners.size > 1) return [];
  const partners = youReceive.length
    ? otherTeams.filter(team => receivingOwners.size === 0
      ? team.id === selectedPartnerId : receivingOwners.has(team.id))
    : otherTeams;
  const myBundles = availableBundles(league, userTeamId);
  const matches: Match[] = [];
  for (const partner of partners) {
    if (!validSelection(league, partner.id, youReceive)) continue;
    const otherBundles = availableBundles(league, partner.id);
    matches.push(...findForPartner(league, userTeamId, partner.id,
      youSend, youReceive, myBundles, otherBundles).slice(0, 5));
    if (matches.length >= 80) break;
  }
  // Spread suggestions across clubs before showing a second bid from one GM.
  const ranked = matches.sort((a, b) => b.score - a.score);
  const chosen: Match[] = [];
  const used = new Set<string>();
  for (const limit of [1, 2, 3, 5, 8]) {
    for (const match of ranked) {
      const count = chosen.filter(item => item.partnerId === match.partnerId).length;
      if (count >= limit || used.has(match.partnerId + "|" + match.signature)) continue;
      chosen.push(match);
      used.add(match.partnerId + "|" + match.signature);
      if (chosen.length === 8) return chosen;
    }
  }
  return chosen;
}
