import type { GmAttributes, GmBadgeId, GmBoxScore, GmPlayer } from "@/gm/types";
import { activeMentor } from "@/gm/engine/development";

export const BADGE_LEVELS = ["Locked", "Bronze", "Silver", "Gold", "Hall of Fame", "Legend"] as const;
export const BADGE_XP = [0, 120, 360, 900, 1800, 3200] as const;
export const BADGE_REQUIREMENTS = [0, 65, 75, 84, 92, 97] as const;
type Badge = { id: GmBadgeId; name: string; category: NonNullable<GmPlayer["developmentFocus"]>; attributes: (keyof GmAttributes)[]; action: string; effect: string };
/** DRBL thresholds and effects, calibrated for this possession model, not 2K's animation system. */
export const BADGES: readonly Badge[] = [
  { id: "inside_touch", name: "Inside touch", category: "balanced", attributes: ["closeShot", "drivingLayup"], action: "Made two-pointers: 2 XP each", effect: "+0.3 percentage points to two-point accuracy per level" },
  { id: "deep_range", name: "Deep range", category: "shooting", attributes: ["threePoint"], action: "Made threes: 4 XP each", effect: "+0.3 percentage points to three-point accuracy per level" },
  { id: "free_throw", name: "Free throw routine", category: "shooting", attributes: ["freeThrow"], action: "Made free throws: 2 XP each", effect: "+0.4 percentage points to free-throw accuracy per level" },
  { id: "floor_general", name: "Floor general", category: "creation", attributes: ["passAccuracy"], action: "Assists: 3 XP each", effect: "+2% assist rate per level; teammates gain up to 0.5 percentage points of shot accuracy" },
  { id: "secure_handle", name: "Secure handle", category: "creation", attributes: ["ballHandle", "speedWithBall"], action: "Ball uses minus three times turnovers, up to 12 XP per game", effect: "Handler turnover chance reduced by 1.2% per level" },
  { id: "passing_lanes", name: "Passing lanes", category: "defense", attributes: ["steal"], action: "Steals: 6 XP each", effect: "+2.5% steal rate per level" },
  { id: "rim_guardian", name: "Rim guardian", category: "defense", attributes: ["block", "interiorDefense"], action: "Blocks: 6 XP each", effect: "+2.5% block rate per level" },
  { id: "glass_cleaner", name: "Glass cleaner", category: "rebounding", attributes: ["offReb", "defReb"], action: "Rebounds: 2 XP each", effect: "+2.5% rebound weight per level" },
  { id: "defensive_anchor", name: "Defensive anchor", category: "defense", attributes: ["perimeterDefense", "interiorDefense"], action: "One XP per four minutes when opponents shoot 48% or less", effect: "Opponent shot accuracy reduced by up to 0.5 percentage points across the lineup" },
  { id: "clutch_scorer", name: "Clutch scorer", category: "balanced", attributes: ["midrange", "threePoint"], action: "Made shots in the last four minutes or overtime, score within 10: 6 XP each", effect: "+0.3 percentage points to shot accuracy per level in close late-game possessions" },
];

export function badgeSkill(player: GmPlayer, id: GmBadgeId): number {
  const definition = BADGES.find(b => b.id === id)!;
  // One strong defensive or rebounding role is sufficient; creation and rim protection need both skills.
  const values = definition.attributes.map(key => player.sheet?.attributes[key] ?? 0);
  return ["glass_cleaner", "defensive_anchor", "clutch_scorer"].includes(id) ? Math.max(...values) : values.reduce((a,b) => a+b,0) / values.length;
}
export function badgeCap(player: GmPlayer, id: GmBadgeId): number {
  const skill = badgeSkill(player, id);
  return BADGE_REQUIREMENTS.reduce<number>((rank, gate, index) => skill >= gate ? index : rank, 0);
}
export function badgeEarned(player: GmPlayer, id: GmBadgeId): number {
  const xp = player.badges?.xp[id] ?? 0;
  return BADGE_XP.reduce<number>((rank, gate, index) => xp >= gate ? index : rank, 0);
}
export function badgeLevel(player: GmPlayer, id: GmBadgeId): number {
  return Math.min(badgeEarned(player, id), badgeCap(player, id));
}

/** Seed a few signature skills once. Never reads hidden potential or rewrites ratings. */
export function ensureBadges(player: GmPlayer): GmPlayer {
  if (player.badges?.version === 1) return player;
  const rookie = player.age <= 22 || !player.contract;
  const signatures = BADGES.filter(b => badgeSkill(player, b.id) >= 75)
    .sort((a,b) => badgeSkill(player,b.id) - badgeSkill(player,a.id) || a.id.localeCompare(b.id)).slice(0, rookie ? 1 : 3);
  const xp = Object.fromEntries(signatures.map(b => [b.id, BADGE_XP[Math.max(1, Math.min(rookie ? 1 : 3, badgeCap(player,b.id) - 1))]! ]));
  return { ...player, badges: { version: 1, xp } };
}

export function defaultBadgeFocus(player: GmPlayer): GmBadgeId | undefined {
  if (player.badgeFocus && badgeCap(player,player.badgeFocus) > badgeEarned(player,player.badgeFocus)) return player.badgeFocus;
  return BADGES.filter(b => badgeCap(player,b.id) > badgeEarned(player,b.id))
    .sort((a,b) => Number(b.category === player.developmentFocus) - Number(a.category === player.developmentFocus) || badgeSkill(player,b.id) - badgeSkill(player,a.id) || a.id.localeCompare(b.id))[0]?.id;
}

/** Receives only official games from the season ledger. Persistent IDs prevent replay farming. */
export function recordBadgeGame(player: GmPlayer, box: GmBoxScore, players: GmPlayer[]): GmPlayer {
  const line = box.players.find(p => p.playerId === player.id && p.minutes > 0);
  if (!line) return player;
  player = ensureBadges(player);
  const book = player.badges!;
  if (book.season != null && (box.season < book.season || (box.season === book.season && book.gameIds?.includes(box.gameId)))) return player;
  const opponent = box.players.filter(p => p.teamId !== line.teamId);
  const attempts = opponent.reduce((n,p) => n+p.fga,0);
  const opponentPct = attempts > 0 ? opponent.reduce((n,p) => n+p.fgm,0) / attempts : 1;
  const clutch = box.events?.filter(e => {
    const scoringSide = line.teamId === box.homeTeamId ? 1 : -1;
    const leadBeforeShot = (e.scoreHome ?? 0) - (e.scoreAway ?? 0) - scoringSide * (e.points ?? 0);
    return e.playerId === player.id && e.isFieldGoal && e.shotResult === "Made" && (e.period > 4 || (e.period === 4 && (e.clockSeconds ?? 720) <= 240)) && Math.abs(leadBeforeShot) <= 10;
  }).length ?? 0;
  const raw: Record<GmBadgeId,number> = {
    inside_touch: Math.max(0,line.fgm-line.tpm)*2, deep_range: line.tpm*4, free_throw: line.ftm*2,
    floor_general: line.assists*3, secure_handle: Math.max(0,Math.min(12,line.fga+line.assists-3*line.turnovers)),
    passing_lanes: line.steals*6, rim_guardian: line.blocks*6, glass_cleaner: line.rebounds*2,
    defensive_anchor: opponentPct <= 0.48 ? Math.floor(line.minutes/4) : 0, clutch_scorer: clutch*6,
  };
  const focus = defaultBadgeFocus(player);
  const mentor = activeMentor(player,players);
  const xp = { ...book.xp };
  for (const b of BADGES) {
    const cap = badgeCap(player,b.id);
    const current = xp[b.id] ?? 0;
    // No banking above current eligibility; a later skill gain needs fresh court evidence.
    if (cap === 0 || current >= BADGE_XP[cap]!) continue;
    const mentorBonus = mentor && badgeLevel(ensureBadges(mentor),b.id) > badgeLevel(player,b.id) ? 0.1 : 0;
    const gain = Math.min(24,Math.max(0,raw[b.id])) * (1 + (focus === b.id ? 0.25 : 0) + mentorBonus);
    xp[b.id] = Math.min(BADGE_XP[cap]!, Math.round((current + gain)*10)/10);
  }
  return { ...player, badges: { ...book, xp, season: box.season, gameIds: [...(book.season === box.season ? book.gameIds ?? [] : []),box.gameId] } };
}

/** Pure bounded effects used by the possession engine and inspected by regression tests. */
export function badgeEffects(player: GmPlayer) {
  const level = (id: GmBadgeId) => badgeLevel(player,id);
  return { two: level("inside_touch")*0.003, three: level("deep_range")*0.003, ft: level("free_throw")*0.004,
    ast: 1+level("floor_general")*0.02, passing: level("floor_general")*0.001,
    tov: 1-level("secure_handle")*0.012, stl: 1+level("passing_lanes")*0.025,
    blk: 1+level("rim_guardian")*0.025, reb: 1+level("glass_cleaner")*0.025,
    defense: level("defensive_anchor")*0.001, clutch: level("clutch_scorer")*0.003 };
}

export function recordBadgeBox(players: GmPlayer[], box: GmBoxScore): GmPlayer[] {
  return players.map(player => recordBadgeGame(player,box,players));
}
