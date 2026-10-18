/**
 * Record book lookups. The numbers come from the NBA Stats game-log snapshot.
 * This module does not fetch anything.
 */

export type RecordScope = "regular" | "playoffs";

export type RecordLeader = {
  playerId: string;
  /** Basketball-Reference player slug, when the row came from that site. */
  brefId?: string;
  name: string;
  team: string;
  opponent: string;
  date: string;
  season: string;
  gameId: string;
  value: number;
  detail: string;
};

export type BookRecord = {
  id: string;
  group: "game" | "season" | "streak" | "team-game" | "team-season" | "career";
  scope: RecordScope;
  title: string;
  blurb: string;
  decimals: number;
  order: "high" | "low";
  leaders: RecordLeader[];
};

export type BookShape = {
  id: string;
  scope: RecordScope;
  title: string;
  count: number;
  examples: RecordLeader[];
  /** Set when the count does not cover the whole league, for example "since 1996-97". */
  window?: string;
};

export type RecordBook = {
  builtAt: string | null;
  source: string;
  fromSeason: string;
  throughSeason: string | null;
  throughDate: string | null;
  regularSeasonGames: number;
  playoffGames: number;
  playerGameRows: number;
  seasons: string[];
  note: string;
  records: BookRecord[];
  shapes: BookShape[];
};

export type RecordLine = {
  playerName: string;
  gameDate: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  threePm: number;
  turnovers: number;
  minutesNum: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatRecordDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

export function formatRecordValue(value: number, decimals: number): string {
  if (decimals <= 0) return String(Math.round(value));
  return value.toFixed(decimals);
}

export function scopeFromGameType(gameType: string | undefined): RecordScope | null {
  const t = (gameType ?? "regular").toLowerCase();
  if (t.includes("preseason") || t.includes("all-star") || t.includes("allstar")) return null;
  if (t.includes("playoff")) return "playoffs";
  return "regular";
}

function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function sameNight(line: RecordLine, leader: RecordLeader): boolean {
  return line.gameDate.slice(0, 10) === leader.date.slice(0, 10) && normName(line.playerName) === normName(leader.name);
}

function scopeWord(scope: RecordScope): string {
  return scope === "playoffs" ? "playoff" : "regular-season";
}

function highSentence(rec: BookRecord, line: RecordLine, value: number, noun: string): string | null {
  const best = rec.leaders[0];
  if (!best || value < best.value) return null;
  const word = scopeWord(rec.scope);
  if (sameNight(line, best) || (value === best.value && rec.leaders.some((leader) => sameNight(line, leader)))) {
    return `That matches the ${word} high in this book.`;
  }
  if (value > best.value) {
    return `${formatRecordValue(value, 0)} ${noun} is past the ${word} high in this book, ${formatRecordValue(best.value, 0)} by ${best.name} on ${formatRecordDate(best.date)}.`;
  }
  const first = rec.leaders.find((leader) => leader.value === best.value);
  if (first && sameNight(line, first)) return `That is the ${word} high in this book.`;
  return `Ties the ${word} high in this book, ${formatRecordValue(best.value, 0)} ${noun}, held by ${best.name} on ${formatRecordDate(best.date)}.`;
}

function shapeOf(book: RecordBook, id: string): BookShape | undefined {
  return book.shapes.find((shape) => shape.id === id);
}

function shapeSentence(book: RecordBook, id: string, scope: RecordScope, label: string, max = 120): string | null {
  const shape = shapeOf(book, id);
  if (!shape || shape.count <= 0 || shape.count > max) return null;
  const word = scopeWord(scope);
  const noun = shape.count === 1 ? "game" : "games";
  const window = shape.window ? ` ${shape.window}` : "";
  return `This book lists ${shape.count} ${word} ${noun} with ${label}${window}.`;
}

/**
 * One or two sentences when a line meets a published record or a rare shape.
 * Returns null for an ordinary night. Wording avoids calling the book "NBA history",
 * The high it cites is whatever leader the book currently holds.
 */
export function recordNoteFor(line: RecordLine, scope: RecordScope, book: RecordBook): string | null {
  if (!book.throughSeason || !book.records.length) return null;
  const byId = new Map(book.records.map((rec) => [rec.id, rec]));
  const sentences: string[] = [];
  const columns: Array<[string, number, string]> = [
    ["pts", line.points, "points"],
    ["reb", line.rebounds, "rebounds"],
    ["ast", line.assists, "assists"],
    ["stl", line.steals, "steals"],
    ["blk", line.blocks, "blocks"],
    ["fg3m", line.threePm, "threes"],
  ];
  for (const [key, value, noun] of columns) {
    const rec = byId.get(`${scope}-game-${key}`);
    if (!rec) continue;
    const sentence = highSentence(rec, line, value, noun);
    if (sentence) sentences.push(sentence);
  }

  const rare: Array<[boolean, string, string]> = [
    [line.points >= 5 && line.rebounds >= 5 && line.assists >= 5 && line.steals >= 5 && line.blocks >= 5, `${scope}-five`, "5 or more in points, rebounds, assists, steals, and blocks"],
    [line.points >= 70, `${scope}-pts70`, "70 or more points"],
    [line.points >= 60, `${scope}-pts60`, "60 or more points"],
    [line.rebounds >= 25, `${scope}-reb25`, "25 or more rebounds"],
    [line.assists >= 20, `${scope}-ast20`, "20 or more assists"],
    [line.blocks >= 10, `${scope}-blk10`, "10 or more blocks"],
    [line.threePm >= 12, `${scope}-threes12`, "12 or more threes"],
    [line.points >= 20 && line.rebounds >= 20, `${scope}-20reb`, "20 points and 20 rebounds"],
    [line.points >= 20 && line.assists >= 20, `${scope}-20ast`, "20 points and 20 assists"],
    [line.points >= 40 && line.rebounds >= 10 && line.assists >= 10, `${scope}-40td`, "a 40-point triple-double"],
  ];
  for (const [ok, id, label] of rare) {
    if (!ok) continue;
    const sentence = shapeSentence(book, id, scope, label);
    if (!sentence) continue;
    sentences.push(sentence);
    break;
  }

  if (!sentences.length && line.points >= 50) {
    const sentence = shapeSentence(book, `${scope}-pts50`, scope, "50 or more points", 2000);
    if (sentence) sentences.push(sentence);
  }

  if (!sentences.length) return null;
  return sentences.slice(0, 2).join(" ");
}
