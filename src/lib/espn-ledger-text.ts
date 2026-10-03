/**
 * Read ESPN transaction blurbs into who-received-what and roster moves.
 *
 * ESPN writes one row per team in its own voice ("Acquired X from Team for Y",
 * "Traded X to Team for Y", "Boston sent X to Golden State", "Signed X").
 * Pure text rules: callers resolve player identities themselves.
 */

/** ESPN team ids by city, all eras. */
export const CITY_TEAM_IDS: [RegExp, string][] = [
  [/\bAtlanta\b/, "1"],
  [/\bBoston\b/, "2"],
  [/\bNew Orleans\b/, "3"],
  [/\bChicago\b/, "4"],
  [/\bCleveland\b/, "5"],
  [/\bDallas\b/, "6"],
  [/\bDenver\b/, "7"],
  [/\bDetroit\b/, "8"],
  [/\bGolden State\b/, "9"],
  [/\bHouston\b/, "10"],
  [/\bIndiana\b/, "11"],
  [/(?<![A-Za-z.])(LA|L\.A\.|Los Angeles) Clippers\b/, "12"],
  [/(?<![A-Za-z.])(LA|L\.A\.|Los Angeles) Lakers\b/, "13"],
  [/\bMiami\b/, "14"],
  [/\bMilwaukee\b/, "15"],
  [/\bMinnesota\b/, "16"],
  [/\b(Brooklyn|New Jersey)\b/, "17"],
  [/\bNew York\b/, "18"],
  [/\bOrlando\b/, "19"],
  [/\bPhiladelphia\b/, "20"],
  [/\bPhoenix\b/, "21"],
  [/\bPortland\b/, "22"],
  [/\bSacramento\b/, "23"],
  [/\bSan Antonio\b/, "24"],
  [/\b(Oklahoma City|Seattle)\b/, "25"],
  [/\bUtah\b/, "26"],
  [/\bWashington\b/, "27"],
  [/\bToronto\b/, "28"],
  [/\b(Memphis|Vancouver)\b/, "29"],
  [/\bCharlotte\b/, "30"],
];

const NICKNAME_TEAM_IDS: [RegExp, string][] = [
  [/\bHawks\b/, "1"],
  [/\bCeltics\b/, "2"],
  [/\bPelicans\b/, "3"],
  [/\bBulls\b/, "4"],
  [/\bCav(alier)?s\b/, "5"],
  [/\bMav(erick)?s\b/, "6"],
  [/\bNuggets\b/, "7"],
  [/\bPistons\b/, "8"],
  [/\bWarriors\b/, "9"],
  [/\bRockets\b/, "10"],
  [/\bPacers\b/, "11"],
  [/\bClippers\b/, "12"],
  [/\bLakers\b/, "13"],
  [/\bHeat\b/, "14"],
  [/\bBucks\b/, "15"],
  [/\b(Timberwolves|Wolves)\b/, "16"],
  [/\bNets\b/, "17"],
  [/\bKnicks\b/, "18"],
  [/\bMagic\b/, "19"],
  [/\b(76ers|Sixers)\b/, "20"],
  [/\bSuns\b/, "21"],
  [/\bBlazers\b/, "22"],
  [/\bKings\b/, "23"],
  [/\bSpurs\b/, "24"],
  [/\b(Thunder|Sonics|SuperSonics)\b/, "25"],
  [/\bJazz\b/, "26"],
  [/\b(Wizards|Bullets)\b/, "27"],
  [/\bRaptors\b/, "28"],
  [/\bGrizzlies\b/, "29"],
  [/\bBobcats\b/, "30"],
];

/** One ESPN team id for a team name, or undefined when it is unclear. */
export function teamIdForName(name: string): string | undefined {
  const byCity = [...new Set(CITY_TEAM_IDS.filter(([re]) => re.test(name)).map(([, id]) => id))];
  if (byCity.length === 1) return byCity[0];
  const byNick = [...new Set(NICKNAME_TEAM_IDS.filter(([re]) => re.test(name)).map(([, id]) => id))];
  return byNick.length === 1 ? byNick[0] : undefined;
}

export function ledgerSentences(description: string | undefined): string[] {
  if (!description) return [];
  // Initials like "L.A." or "C.J." do not end a sentence.
  return description
    .replace(/\s+/g, " ")
    .split(/(?<=(?:[a-z]{2}|Jr|Sr|II|III|IV)\.)\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const POSITION_PREFIX =
  /^(?:(?:PG|SG|SF|PF|G|F|C)(?:[-/](?:PG|SG|SF|PF|G|F|C))?(?:s|'s|’s)?|(?:guard|forward|center)(?:[-/](?:guard|forward|center))?s?)\s+(?=[A-Z])/;

export function splitLedgerAssets(text: string): string[] {
  return text
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/)
    .map((s) => s.replace(POSITION_PREFIX, "").replace(/(?<!\b(?:Jr|Sr))[.;]+$/, "").trim())
    .filter(Boolean);
}

/** Picks, cash, rights or considerations rather than a player. */
export const NON_PLAYER_ASSET =
  /\b(considerations?|picks?|cash|rights|exceptions?|swaps?|TPE)\b/i;

/** A team receiving an asset. `teamId` is null when the row names no receiver. */
export type TradeReceipt = {
  teamId: string | null;
  label: string;
  fromTeamId?: string;
};

type TeamFor = (name: string) => string | undefined;

const TRADE_SENTENCE = /\b(acquired|acquire|traded|received|sent)\b/i;

/**
 * Who received what in one ESPN row, read from the posting team's voice:
 * "Acquired X from Team [and Y from Team2] (in exchange for|for) Z",
 * "Received X from Team for Z", "Traded X to Team for Z",
 * "[Team] sent X to Team2[, who sent Y to Team3]",
 * "... in a three-team trade that sent Z to Team" and
 * "Team received X from Team2".
 */
export function parseTradeText(
  description: string | undefined,
  rowTeamId: string | undefined,
  teamFor: TeamFor = teamIdForName
): TradeReceipt[] {
  const out: TradeReceipt[] = [];
  const push = (teamId: string | null | undefined, assets: string, fromTeamId?: string) => {
    if (teamId === undefined) return;
    for (const label of splitLedgerAssets(assets)) {
      out.push({ teamId, label, ...(fromTeamId && fromTeamId !== teamId ? { fromTeamId } : {}) });
    }
  };
  const team = rowTeamId;

  for (const sentence of ledgerSentences(description).filter((s) => TRADE_SENTENCE.test(s))) {
    let s = sentence.replace(/\.$/, "");

    const tail = s.match(/\s+in a [\w-]+ trade that sent (.+?) to (?:the )?(.+)$/i);
    if (tail) {
      push(teamFor(tail[2]!) ?? null, tail[1]!, team);
      s = s.slice(0, tail.index);
    }

    for (const clause of s.split(/;\s*|,\s*while\s+/)) {
      const c = clause.trim();

      const acquired = c.match(/^(?:Acquired|Acquire|Received)\s+(.+)$/i);
      if (acquired) {
        if (team) readAcquired(acquired[1]!, team, teamFor, push);
        continue;
      }

      const traded = c.match(
        /^Traded\s+(.+?)\s+to\s+(?:the\s+)?(.+?)(?:\s+(?:in exchange for|for)\s+(.+))?$/i
      );
      if (traded && team) {
        const partner = teamFor(traded[2]!);
        push(partner ?? null, traded[1]!, team);
        if (traded[3]) push(team, traded[3], partner);
        continue;
      }

      const sent = c.match(
        /^(?:(.+?)\s+)??sent\s+(.+?)\s+to\s+(?:the\s+)?([^,]+?)(?:,\s*who\s+sent\s+(.+?)\s+to\s+(?:the\s+)?(.+))?$/i
      );
      if (sent) {
        const sender = sent[1] ? teamFor(sent[1]) : team;
        if (!sender) continue;
        const receiver = teamFor(sent[3]!);
        push(receiver ?? null, sent[2]!, sender);
        if (sent[4] && receiver) push(teamFor(sent[5]!) ?? null, sent[4], receiver);
        continue;
      }

      const thirdParty = c.match(/^(.+?) received (.+?) from (?:the )?(.+)$/i);
      if (thirdParty) push(teamFor(thirdParty[1]!), thirdParty[2]!, teamFor(thirdParty[3]!));
    }
  }
  return out;
}

function readAcquired(
  body: string,
  team: string,
  teamFor: TeamFor,
  push: (teamId: string | null | undefined, assets: string, fromTeamId?: string) => void
) {
  const fromAt = body.search(/\sfrom\s/i);
  if (fromAt < 0) {
    const swap = body.match(/^(.+?)\s+(?:in exchange for|for)\s+(.+)$/i);
    if (swap) {
      push(team, swap[1]!);
      push(null, swap[2]!, team);
    } else {
      push(team, body);
    }
    return;
  }
  const exchangeRel = body.slice(fromAt).search(/\s(?:in exchange for|for)\s/i);
  const chain = exchangeRel >= 0 ? body.slice(0, fromAt + exchangeRel) : body;
  const exchange =
    exchangeRel >= 0
      ? body
          .slice(fromAt + exchangeRel)
          .replace(/^\s(?:in exchange for|for)\s/i, "")
          // "... and were returned their own pick ..." starts a second exchange
          // the clause shape can't attribute.
          .replace(/\s+and\s+(?:were|was)\s+.*$/i, "")
      : null;

  const parts = chain.split(/\s+from\s+(?:the\s+)?/i);
  const givers: (string | undefined)[] = [];
  let assets = parts[0]!;
  for (let i = 1; i < parts.length; i += 1) {
    let giverName = parts[i]!;
    let next = "";
    if (i < parts.length - 1) {
      const split = giverName.search(/\s+and\s+/);
      if (split >= 0) {
        next = giverName.slice(split).replace(/^\s+and\s+/, "");
        giverName = giverName.slice(0, split);
      }
    }
    const giver = teamFor(giverName);
    givers.push(giver);
    push(team, assets, giver);
    assets = next;
  }
  if (exchange) push(givers.length === 1 ? (givers[0] ?? null) : null, exchange, team);
}

export type RosterMoveKind = "draft" | "signing" | "re-signing" | "claim" | "waive";

/** A non-trade roster move by the posting team. */
export type RosterMove = { kind: RosterMoveKind; label: string };

const DRAFT_SIGNING =
  /\btheir (?:\d{4} )?(?:first|second|1st|2nd)[- ]round (?:draft )?picks?\b|\b(?:first|second)-round picks? in the \d{4} (?:NBA )?draft\b|\brookie[- ]scale\b/i;
const EXTENSION = /\bextension\b/i;
const NAME_TAIL =
  /\s+(?:to\s+(?:a|an|the|their|two|three|four|five|six|multi|rookie|veteran|contracts?|terms)\b.*|off waivers\b.*|on (?:a|an)\b.*|for the\b.*)$|,\s*their\b.*$/i;
const NAME_LIKE =
  /^[A-Z][A-Za-z'’.\-]+(?:\s+[A-Z][A-Za-z'’.\-]+){0,3}(?:\s+(?:Jr\.?|Sr\.?|II|III|IV|V))?$/;

export function parseRosterMoves(description: string | undefined): RosterMove[] {
  const out: RosterMove[] = [];
  for (const sentence of ledgerSentences(description)) {
    for (const raw of sentence.replace(/\.$/, "").split(/;\s*/)) {
      const clause = raw.trim();
      const verb = clause.match(
        /^(Re-signed|Resigned|Signed|Agreed to terms with|Claimed|Waived|Released)\s+(.+)$/i
      );
      if (!verb) continue;
      const v = verb[1]!.toLowerCase();
      let kind: RosterMoveKind;
      if (v === "claimed") kind = "claim";
      else if (v === "waived" || v === "released") kind = "waive";
      else if (v === "re-signed" || v === "resigned" || EXTENSION.test(clause)) kind = "re-signing";
      else if (DRAFT_SIGNING.test(clause)) kind = "draft";
      else kind = "signing";
      const names = verb[2]!.replace(NAME_TAIL, "");
      for (const label of splitLedgerAssets(names)) {
        if (NAME_LIKE.test(label)) out.push({ kind, label });
      }
    }
  }
  return out;
}
