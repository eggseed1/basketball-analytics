import { calendar } from "@/one-shot/career";
import { hashString } from "@/one-shot/rng";
import type { LifeState, NodeKind } from "@/one-shot/types";
import { country, type FibaRegion } from "@/one-shot/world";

import { kitFor, opponentKit, type Kit } from "./kit";

/**
 * Original pixel art for ONE SHOT. Everything here is a pure function of the
 * state plus a frame counter; it never touches the game's random streams.
 * Climate and architecture are decorative picks by country, not data.
 */

const SKIN = ["#F3D3B5", "#E2B48C", "#C98E62", "#A86E46", "#7A4C2E", "#55331F"];
const HAIR = ["#1B1412", "#4A2F1D", "#8A5A2B", "#C9A15A"];

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

function painter(ctx: CanvasRenderingContext2D, scale: number): Px {
  return (x, y, w, h, c) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x * scale), Math.round(y * scale), Math.round(w * scale), Math.round(h * scale));
  };
}

/** Small deterministic generator for decoration. */
function rand(key: string) {
  let a = hashString(key) | 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;
}

function mixHex(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => c(s).toString(16).padStart(2, "0")).join("")}`;
}

const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

function drawDigits(px: Px, n: number, cx: number, y: number, color: string, scale = 1) {
  const s = String(n);
  const w = s.length * 4 * scale - scale;
  let x = Math.round(cx - w / 2);
  for (const ch of s) {
    const g = DIGITS[Number(ch)]!;
    for (let i = 0; i < 15; i++) if (g[i] === "1") px(x + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale, color);
    x += 4 * scale;
  }
}

/* ------------------------------------------------------------ places */

type Climate = "tropical" | "arid" | "cold" | "temperate";

const COLD = new Set("CA RU MN KZ KG TJ UZ KP KR JP NO SE FI IS EE LV LT BY UA PL CZ SK HU RO BG MD AT CH DE DK NL BE LU GB IE SI HR BA RS ME MK XK GL FO AM GE AZ".split(" "));
const ARID = new Set("EG LY TN DZ MA EH MR ML NE TD SD SA YE OM AE QA BH KW IQ IR JO SY IL PS LB AF PK TM DJ SO ER NA BW AU".split(" "));
const TROPICAL = new Set(
  "BR CO VE EC PE BO GY SR GF PA CR NI HN SV GT BZ CU JM HT DO PR BS TT BB LC VC GD AG DM KN AW CW SX BQ TC KY VG VI AI MS MQ GP BL MF NG GH CI SN GM GN GW SL LR BF TG BJ CM CF GA CG CD GQ ST AO ZM MW MZ TZ KE UG RW BI ET SS MG KM MU SC RE YT IN BD LK MV MM TH LA KH VN MY SG ID PH BN TL PG SB VU FJ WS TO TV KI NR FM MH PW GU MP NC PF CK NU WF AS TK".split(
    " ",
  ),
);
const SOUTH = new Set("AR CL UY PY ZA LS SZ NZ AU NA BW ZW".split(" "));

export function climateOf(countryId: string): Climate {
  if (TROPICAL.has(countryId)) return "tropical";
  if (ARID.has(countryId)) return "arid";
  if (COLD.has(countryId)) return "cold";
  return "temperate";
}

const ROOF: Record<FibaRegion, string[]> = {
  europe: ["#B5523B", "#9C4632", "#6E5A50"],
  americas: ["#5B5F66", "#7A5C48", "#3F4A5A"],
  africa: ["#9AA3A8", "#8C7A66", "#B0B6B8"],
  asia: ["#3D4A5C", "#7A3B32", "#5B5F66"],
  oceania: ["#A23B2A", "#5B6670", "#C2B9A8"],
  none: ["#6E5A50", "#5B5F66", "#7A5C48"],
};
const WALLS: Record<FibaRegion, string[]> = {
  europe: ["#E8DCC4", "#D9C7A8", "#F0E8DA", "#C9B8A0"],
  americas: ["#D7DEE4", "#E6D7BF", "#B9C7D3", "#F0EAE0"],
  africa: ["#D9B98E", "#E6C9A0", "#C9A27A", "#EADBC6"],
  asia: ["#D8D4CC", "#C9CFD6", "#E2D6C0", "#B8BEC6"],
  oceania: ["#E8E2D6", "#CFDCE4", "#F2E6CF", "#D6C9B4"],
  none: ["#D8D4CC", "#E6D7BF", "#C9CFD6", "#F0E8DA"],
};

interface Env {
  seed: number;
  countryId: string;
  locality: "capital" | "city" | "town" | "rural";
  climate: Climate;
  region: FibaRegion;
  winter: boolean;
  snow: boolean;
  kit: Kit;
}

function envOf(s: LifeState): Env {
  const { month } = calendar(s);
  const countryId = s.residence.countryId;
  const climate = climateOf(countryId);
  const south = SOUTH.has(countryId);
  const winter = south ? month >= 6 && month <= 8 : month === 12 || month <= 2;
  const kit = s.after ? kitFor(s.seed, "local-club", s.after.employer) : kitFor(s.seed, s.placement.node, s.placement.teamName);
  return {
    seed: s.seed,
    countryId,
    locality: s.residence.localityKind,
    climate,
    region: country(countryId).region,
    winter,
    snow: winter && climate === "cold",
    kit,
  };
}

/** Uniform colors for a placement; kept for callers that only need a color. */
export function jerseyColor(node: NodeKind, seed = 0, teamName: string | null = null) {
  return kitFor(seed, node, teamName ?? node).primary;
}

/* ------------------------------------------------------------ portrait */

/** 32x32 head-and-shoulders portrait in his current uniform. */
export function drawPortrait(ctx: CanvasRenderingContext2D, s: Pick<LifeState, "identity" | "ageMonths" | "placement" | "seed">, size: number) {
  const px = painter(ctx, size / 32);
  const { look } = s.identity;
  const skin = SKIN[look.skin] ?? SKIN[2]!;
  const skinD = shade(skin, -0.16);
  const hair = HAIR[look.hairColor] ?? HAIR[0]!;
  const age = s.ageMonths / 12;
  const kit = kitFor(s.seed, s.placement.node, s.placement.teamName);
  ctx.clearRect(0, 0, size, size);
  const bgTop = kit.uniform ? mixHex(kit.primary, "#FFFFFF", 0.72) : "#DCE6EE";
  const bgBot = kit.uniform ? mixHex(kit.primary, "#FFFFFF", 0.55) : "#C9D6E0";
  px(0, 0, 32, 32, bgTop);
  px(0, 20, 32, 12, bgBot);
  for (let y = 0; y < 20; y += 4) px(0, y, 32, 1, mixHex(bgTop, "#FFFFFF", 0.25));
  if (age < 3) {
    px(9, 9, 14, 13, skin);
    px(8, 11, 1, 8, skin);
    px(23, 11, 1, 8, skin);
    px(10, 8, 12, 1, skin);
    px(14, 7, 4, 2, hair);
    px(12, 14, 2, 2, "#1B1412");
    px(18, 14, 2, 2, "#1B1412");
    px(11, 17, 2, 1, "#E8A0A0");
    px(19, 17, 2, 1, "#E8A0A0");
    px(14, 19, 4, 1, "#B5655A");
    px(6, 24, 20, 8, "#F2E6C9");
    px(14, 24, 4, 2, skin);
    px(6, 24, 2, 8, "#E5D6B4");
    return;
  }
  const kid = age < 12;
  const teen = age < 18;
  const headW = kid ? 14 : 12;
  const headH = kid ? 14 : 14;
  const hx = 16 - headW / 2;
  const hy = kid ? 6 : 4;
  const shoulders = kid ? 18 : teen ? 22 : 26;
  const sx = 16 - shoulders / 2;
  const top = hy + headH + 2;
  px(14, hy + headH - 1, 4, 4, skinD);
  if (kit.uniform) {
    px(sx, top, shoulders, 32 - top, kit.primary);
    px(sx, top, 4, 32 - top, skin);
    px(sx + shoulders - 4, top, 4, 32 - top, skin);
    px(sx + 4, top, 1, 32 - top, kit.secondary);
    px(sx + shoulders - 5, top, 1, 32 - top, kit.secondary);
    px(12, top, 8, 2, skin);
    px(13, top + 2, 6, 1, skin);
    px(11, top, 1, 3, kit.secondary);
    px(20, top, 1, 3, kit.secondary);
    px(12, top + 3, 8, 1, kit.secondary);
    if (kit.number !== null) drawDigits(px, kit.number, 16, top + 5, kit.ink);
  } else {
    px(sx, top, shoulders, 32 - top, kit.primary);
    px(sx, top + 4, shoulders, 32 - top - 4, shade(kit.primary, -0.08));
    px(13, top, 6, 2, skin);
    px(12, top, 8, 1, shade(kit.primary, -0.2));
  }
  px(hx, hy, headW, headH, skin);
  px(hx + headW - 2, hy + 1, 2, headH - 2, skinD);
  px(hx - 1, hy + 6, 1, 3, skin);
  px(hx + headW, hy + 6, 1, 3, skinD);
  const styles: (() => void)[] = [
    () => px(hx, hy - 1, headW, 3, hair),
    () => (px(hx - 1, hy - 2, headW + 2, 4, hair), px(hx - 1, hy + 2, 2, 5, hair), px(hx + headW - 1, hy + 2, 2, 5, hair)),
    () => (px(hx + 1, hy - 1, headW - 2, 2, hair), px(hx, hy, 1, 2, hair)),
    () => (px(hx - 2, hy - 4, headW + 4, 6, hair), px(hx - 3, hy - 1, 2, 7, hair), px(hx + headW + 1, hy - 1, 2, 7, hair), px(hx, hy - 5, headW, 1, hair)),
    () => (px(hx, hy - 1, headW, 2, hair), px(hx + 3, hy - 3, headW - 6, 2, hair)),
  ];
  styles[look.hair % styles.length]!();
  const eyeY = hy + 6;
  px(hx + 2, eyeY - 2, 3, 1, hair);
  px(hx + headW - 5, eyeY - 2, 3, 1, hair);
  px(hx + 3, eyeY, 2, 2, "#FFFFFF");
  px(hx + headW - 5, eyeY, 2, 2, "#FFFFFF");
  px(hx + 4, eyeY, 1, 2, "#1B1412");
  px(hx + headW - 4, eyeY, 1, 2, "#1B1412");
  px(hx + headW / 2 - 1, eyeY + 3, 2, 2, skinD);
  px(hx + headW / 2 - 2, eyeY + 6, 4, 1, "#8C4A3E");
  if (!teen && hashString(`${s.seed}:beard`) % 3 === 0) {
    px(hx + 1, eyeY + 5, headW - 2, 1, shade(hair, 0.1));
    px(hx + 2, hy + headH - 2, headW - 4, 2, shade(hair, 0.1));
    px(hx + headW / 2 - 2, eyeY + 6, 4, 1, "#8C4A3E");
  }
}

/* ------------------------------------------------------------ scene kinds */

type SceneKind = "nursery" | "yard" | "street" | "dusk" | "gym" | "club" | "college" | "hall" | "pro" | "gleague" | "nba" | "draft" | "coach" | "studio" | "podcast" | "scout" | "trainer" | "date" | "brawl" | "hotel" | "flu" | "banquet" | "golf" | "classroom" | "cards" | "clinic";

const STAGED: SceneKind[] = ["date", "brawl", "hotel", "flu", "banquet", "golf", "classroom", "cards", "clinic"];

export function sceneKind(s: LifeState): SceneKind {
  const age = s.ageMonths / 12;
  if (age < 3) return "nursery";
  if (typeof s.flags.scene === "string" && typeof s.flags.sceneUntil === "number" && s.ageMonths <= s.flags.sceneUntil && (STAGED as string[]).includes(s.flags.scene)) return s.flags.scene as SceneKind;
  if (s.after) return ({ coach: "coach", media: "studio", podcast: "podcast", scout: "scout", trainer: "trainer" } as const)[s.after.track];
  const d = s.achievements.drafted;
  if (d && s.ageMonths - d.month <= 1) return "draft";
  switch (s.placement.node) {
    case "home":
      return age < 11 ? "yard" : "street";
    case "playground":
      return "street";
    case "unattached":
      return "dusk";
    case "school-team":
    case "us-high-school":
      return "gym";
    case "local-club":
    case "elite-youth":
      return "club";
    case "university":
      return "college";
    case "local-senior":
      return "hall";
    case "g-league":
      return "gleague";
    case "nba":
      return "nba";
    default:
      return "pro";
  }
}

export const SCENE_W = 192;
export const SCENE_H = 108;
const W = SCENE_W;
const H = SCENE_H;
const HORIZON = 66;
const FEET = 96;

/** Low-res life scene. `frame` drives the animation; pass 0 for a still. */
export function drawScene(ctx: CanvasRenderingContext2D, s: LifeState, frame: number) {
  const px = painter(ctx, 1);
  const kind = sceneKind(s);
  const env = envOf(s);
  ctx.clearRect(0, 0, W, H);
  const heightPx = Math.max(16, Math.min(46, (s.body.heightCm / 205) * 42));
  const hero = { skin: SKIN[s.identity.look.skin] ?? SKIN[2]!, hair: HAIR[s.identity.look.hairColor] ?? HAIR[0]!, style: s.identity.look.hair, age: s.ageMonths / 12 };
  const playing = Boolean(s.season && s.season.gp > 0);
  switch (kind) {
    case "nursery":
      return drawNursery(px, s, env, frame, hero);
    case "yard":
      drawSky(px, env, false, frame);
      drawFar(px, env, false, frame);
      drawYard(px, env);
      break;
    case "street":
    case "dusk":
      drawSky(px, env, kind === "dusk", frame);
      drawFar(px, env, kind === "dusk", frame);
      drawStreetCourt(px, env, kind === "dusk");
      break;
    case "gym":
    case "club":
      drawGym(px, env, kind === "club", s, frame);
      break;
    case "college":
      drawArena(px, env, frame, { density: 0.9, teamShare: 0.75, rows: 6, dark: false, led: false, banners: true, jumbo: false });
      break;
    case "hall":
      drawHall(px, env, frame);
      break;
    case "pro":
      drawArena(px, env, frame, { density: 0.8, teamShare: 0.55, rows: 6, dark: true, led: true, banners: false, jumbo: false });
      break;
    case "gleague":
      drawArena(px, env, frame, { density: 0.45, teamShare: 0.5, rows: 5, dark: true, led: true, banners: false, jumbo: false });
      break;
    case "nba":
      drawArena(px, env, frame, { density: 0.97, teamShare: 0.65, rows: 7, dark: true, led: true, banners: true, jumbo: true });
      break;
    case "draft":
      return drawDraft(px, s, env, frame, hero, heightPx);
    case "coach":
      return drawCoach(px, s, env, frame, hero, heightPx);
    case "studio":
      return drawStudio(px, s, env, frame, hero);
    case "podcast":
      return drawPodcast(px, s, env, frame, hero);
    case "scout":
      return drawScout(px, s, env, frame, hero);
    case "trainer":
      return drawTrainer(px, s, env, frame, hero, heightPx);
    case "date":
      return drawDate(px, env, frame, hero, heightPx);
    case "brawl":
      return drawBrawl(px, s, env, frame, hero, heightPx);
    case "hotel":
      return drawHotel(px, env, frame, hero, heightPx);
    case "flu":
      return drawFlu(px, s, env, frame, hero, heightPx);
    case "banquet":
      return drawBanquet(px, env, frame, hero, heightPx);
    case "golf":
      return drawGolf(px, env, frame, hero, heightPx);
    case "classroom":
      return drawClassroom(px, s, env, frame, hero, heightPx);
    case "cards":
      return drawCards(px, env, frame, hero, heightPx);
    case "clinic":
      return drawClinic(px, env, frame, hero, heightPx);
  }
  if (env.snow && (kind === "yard" || kind === "street" || kind === "dusk")) drawSnowfall(px, env, frame);
  const indoor = !["yard", "street", "dusk"].includes(kind);
  if (indoor && playing && (kind === "college" || kind === "pro" || kind === "gleague" || kind === "nba")) {
    const opp = opponentKit(s.seed, s.placement.teamName, `${s.season?.key ?? ""}:${s.lastGame?.opponent ?? ""}`);
    drawPlayer(px, { x: 100, footY: FEET - 2, h: Math.round(heightPx * (0.94 + (hashString(`${s.seed}:${s.lastGame?.opponent ?? ""}`) % 10) / 100)), skin: SKIN[hashString(`${s.lastGame?.opponent ?? "x"}:skin`) % 6]!, hair: HAIR[0]!, style: 2, age: 25, kit: opp, facing: 1, pose: "defend", frame });
  }
  drawPlayer(px, { x: 128, footY: FEET, h: heightPx, ...hero, kit: env.kit, facing: -1, pose: "dribble", frame });
  if (kind === "nba" && typeof s.flags.champAt === "number" && s.ageMonths - s.flags.champAt <= 1) drawTitle(px, env, frame);
}

type Hero = { skin: string; hair: string; style: number; age: number };

function drawDate(px: Px, env: Env, frame: number, hero: Hero, h: number) {
  for (let y = 0; y < H; y++) px(0, y, W, 1, y < 70 ? shade("#1A1424", y / 140) : "#2A2430");
  px(18, 28, 70, 36, "#3A2430");
  px(22, 32, 22, 14, "#F2D3A2");
  px(110, 40, 50, 8, "#C45C26");
  px(118, 48, 6, 10, "#E8E0D4");
  drawPlayer(px, { x: 70, footY: FEET, h: Math.round(h * 0.85), ...hero, kit: env.kit, facing: 1, pose: "stand", frame });
  drawPlayer(px, { x: 96, footY: FEET - 1, h: Math.round(h * 0.8), skin: SKIN[(hashString(env.kit.primary) + 2) % 6]!, hair: HAIR[1]!, style: 1, age: 22, kit: { ...env.kit, primary: "#6E2430" }, facing: -1, pose: "stand", frame });
}

function drawBrawl(px: Px, s: LifeState, env: Env, frame: number, hero: Hero, h: number) {
  drawArena(px, env, frame, { density: 0.9, teamShare: 0.5, rows: 6, dark: true, led: true, banners: false, jumbo: false });
  const fan = SKIN[hashString(`${s.seed}:fan`) % 6]!;
  drawPlayer(px, { x: 78, footY: 58, h: Math.round(h * 0.55), skin: fan, hair: HAIR[3]!, style: 0, age: 40, kit: { ...env.kit, primary: "#C4C0B4", uniform: false }, facing: 1, pose: "stand", frame });
  drawPlayer(px, { x: 100, footY: FEET - 6, h, ...hero, kit: env.kit, facing: -1, pose: "defend", frame });
  if (frame % 8 < 4) px(88, 40, 8, 2, "#F2E6C8");
}

function drawHotel(px: Px, env: Env, frame: number, hero: Hero, h: number) {
  for (let y = 0; y < H; y++) px(0, y, W, 1, "#241E18");
  px(0, 78, W, 30, "#3A3228");
  px(24, 36, 70, 48, "#6A5038");
  px(30, 42, 58, 8, "#E8D8A8");
  px(34, 52, 10, 10, "#C45C26");
  px(48, 52, 10, 10, "#C45C26");
  px(140, 24, 28, 40, frame % 20 < 10 ? "#8FB4D4" : "#6E90B0");
  drawPlayer(px, { x: 120, footY: FEET, h: Math.round(h * 0.9), ...hero, kit: env.kit, facing: -1, pose: "stand", frame });
}

function drawFlu(px: Px, s: LifeState, env: Env, frame: number, hero: Hero, h: number) {
  drawArena(px, env, frame, { density: 0.97, teamShare: 0.65, rows: 7, dark: true, led: true, banners: true, jumbo: true });
  const opp = opponentKit(s.seed, s.placement.teamName, `${s.season?.key ?? ""}:${s.lastGame?.opponent ?? ""}`);
  drawPlayer(px, { x: 70, footY: FEET - 2, h: Math.round(h * 0.92), skin: SKIN[1]!, hair: HAIR[0]!, style: 2, age: 26, kit: opp, facing: 1, pose: "defend", frame });
  drawPlayer(px, { x: 118, footY: FEET + (frame % 12 < 6 ? 1 : 0), h, ...hero, kit: env.kit, facing: -1, pose: "dribble", frame });
  px(108, FEET - h - 6, 10, 3, "#E8E8E8");
}

function drawBanquet(px: Px, env: Env, frame: number, hero: Hero, h: number) {
  for (let y = 0; y < H; y++) px(0, y, W, 1, y < HORIZON ? "#1C140E" : "#3A2A20");
  for (let i = 0; i < 5; i++) px(16 + i * 34, 70, 28, 6, "#6A4030");
  px(70, 22, 50, 16, frame % 16 < 8 ? "#E8C56A" : "#C4A24A");
  drawPlayer(px, { x: 96, footY: FEET - 4, h: Math.round(h * 0.9), ...hero, kit: env.kit, facing: 1, pose: "suit", frame });
}

function drawGolf(px: Px, env: Env, frame: number, hero: Hero, h: number) {
  drawSky(px, { ...env, snow: false }, false, frame);
  px(0, HORIZON, W, H - HORIZON, "#3E7A3A");
  px(40, 78, 30, 4, "#E8E4D0");
  px(150, 60, 8, 18, "#5A4030");
  px(146, 56, 16, 6, "#2E6A32");
  drawPlayer(px, { x: 78, footY: FEET, h: Math.round(h * 0.88), ...hero, kit: { ...env.kit, primary: "#F2F2EA" }, facing: 1, pose: "polo", frame });
}

function drawClassroom(px: Px, s: LifeState, env: Env, frame: number, hero: Hero, h: number) {
  drawGym(px, env, false, s, frame);
  for (let i = 0; i < 4; i++) drawPlayer(px, { x: 36 + i * 22, footY: FEET, h: Math.round(h * 0.55), skin: SKIN[i % 6]!, hair: HAIR[i % 5]!, style: i % 3, age: 15, kit: env.kit, facing: -1, pose: "stand", frame });
  drawPlayer(px, { x: 150, footY: FEET - 2, h, ...hero, kit: env.kit, facing: -1, pose: "stand", frame });
}

function drawCards(px: Px, env: Env, frame: number, hero: Hero, h: number) {
  for (let y = 0; y < H; y++) px(0, y, W, 1, "#1A1814");
  px(20, 62, 150, 10, "#C4B49A");
  for (let i = 0; i < 8; i++) px(28 + i * 16, 52, 10, 14, i % 2 ? "#F4F0E4" : "#E8D2A0");
  drawPlayer(px, { x: 96, footY: 74, h: Math.round(h * 0.7), ...hero, kit: env.kit, facing: 1, pose: "stand", frame });
}

function drawClinic(px: Px, env: Env, frame: number, hero: Hero, h: number) {
  for (let y = 0; y < H; y++) px(0, y, W, 1, y < 80 ? "#E8EEF2" : "#D0D6DC");
  px(120, 30, 40, 50, "#F7FBFC");
  px(126, 48, 28, 4, "#8AA0A8");
  drawPlayer(px, { x: 70, footY: FEET, h: Math.round(h * 0.9), ...hero, kit: env.kit, facing: 1, pose: "stand", frame });
}

/** Title month: confetti and the trophy, a gold ball over a net on a tapered stand. */
function drawTitle(px: Px, env: Env, frame: number) {
  const r = rand(`${env.seed}:confetti`);
  const colors = [env.kit.primary, env.kit.secondary, "#F2C14E", "#FFFFFF"];
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor((r() * FEET + frame * (0.5 + r() * 0.7)) % FEET);
    px(x, y, 1 + (i % 2), 1, colors[i % colors.length]!);
  }
  const tx = 156;
  px(tx - 6, FEET - 4, 12, 4, "#3A2A1A");
  px(tx - 3, FEET - 9, 6, 5, "#C99A2E");
  px(tx - 2, FEET - 18, 4, 9, "#E0B341");
  px(tx - 1, FEET - 23, 2, 5, "#E0B341");
  px(tx - 4, FEET - 29, 8, 6, "#F2C14E");
  px(tx - 3, FEET - 28, 2, 2, "#FFF1B8");
}

/* ------------------------------------------------------------ outdoor */

function drawSky(px: Px, env: Env, dusk: boolean, frame: number) {
  const bands = dusk
    ? ["#26264A", "#3B3160", "#5E3F6E", "#93506E", "#D9786A", "#F2A66A"]
    : env.snow || (env.winter && env.climate !== "tropical")
      ? ["#8EA6BA", "#9DB3C4", "#AEC0CE", "#BFCCD7", "#CFD8E0", "#DDE3E8"]
      : env.climate === "arid"
        ? ["#7DB3DA", "#93C0E0", "#AACDE4", "#C4D9E6", "#DCE2DE", "#EDE3CF"]
        : env.climate === "tropical"
          ? ["#3E93D8", "#55A2DE", "#6EB1E4", "#8AC1EA", "#A9D2EF", "#C8E2F3"]
          : ["#5E9BD3", "#72A8D9", "#89B6DF", "#A1C4E5", "#BAD3EB", "#D2E2F0"];
  const bh = Math.ceil(HORIZON / bands.length);
  bands.forEach((c, i) => px(0, i * bh, W, bh, c));
  if (dusk) {
    px(140, 44, 18, 3, "#FFC37A");
    px(142, 41, 14, 3, "#FFB060");
    px(145, 39, 8, 2, "#FFA050");
  } else {
    px(160, 10, 8, 8, "#FFF1B0");
    px(159, 12, 10, 4, "#FFF1B0");
    px(162, 9, 4, 10, "#FFF1B0");
  }
  const r = rand(`${env.seed}:clouds`);
  const drift = frame ? (frame * 0.15) % W : 0;
  for (let i = 0; i < 3; i++) {
    const cx = (r() * W + drift) % (W + 30) - 20;
    const cy = 6 + r() * 20;
    const c = dusk ? "#7C5A80" : "#F6F9FC";
    px(cx, cy, 18, 4, c);
    px(cx + 4, cy - 3, 9, 3, c);
    px(cx + 12, cy - 1, 6, 1, c);
  }
}

function tree(px: Px, env: Env, x: number, base: number, size: number) {
  const trunk = "#6B4A32";
  if (env.climate === "tropical") {
    px(x, base - size, 2, size, "#8A6A44");
    const leaf = "#3E8E4A";
    px(x - 6, base - size - 1, 14, 2, leaf);
    px(x - 8, base - size + 1, 4, 2, leaf);
    px(x + 6, base - size + 1, 4, 2, leaf);
    px(x - 3, base - size - 3, 8, 2, shade(leaf, 0.15));
  } else if (env.climate === "arid") {
    px(x, base - size * 0.5, 2, size * 0.5, trunk);
    px(x - 4, base - size * 0.5 - 4, 10, 4, "#7C8E4E");
  } else if (env.climate === "cold") {
    const c = env.snow ? "#3E5E4E" : "#2F5E44";
    for (let i = 0; i < 4; i++) px(x - 1 - i * 1.5, base - size + i * (size / 4), 4 + i * 3, size / 4, c);
    if (env.snow) for (let i = 0; i < 4; i++) px(x - 1 - i * 1.5, base - size + i * (size / 4), 4 + i * 3, 1, "#F4F7FA");
    px(x + 1, base - 3, 2, 3, trunk);
  } else {
    px(x, base - size * 0.45, 2, size * 0.45, trunk);
    const leaf = env.winter ? "#7F7A64" : "#4F8E3E";
    px(x - 5, base - size, 12, size * 0.6, leaf);
    px(x - 3, base - size - 2, 8, 2, leaf);
    px(x - 4, base - size + 1, 4, 3, shade(leaf, 0.18));
  }
}

function drawFar(px: Px, env: Env, dusk: boolean, frame: number) {
  const r = rand(`${env.seed}:far:${env.locality}`);
  const roofs = ROOF[env.region];
  const walls = WALLS[env.region];
  const night = dusk;
  const lit = "#FFD98A";
  if (env.locality === "rural") {
    const hill = env.snow ? "#E6ECF0" : env.climate === "arid" ? "#C9A66B" : env.climate === "tropical" ? "#5E9E57" : env.winter ? "#8E9A6E" : "#7FAE5A";
    for (let x = 0; x < W; x++) {
      const h1 = 14 + Math.sin(x / 23 + r() * 0.01) * 6 + Math.sin(x / 9) * 2;
      px(x, HORIZON - h1, 1, h1, night ? shade(hill, -0.55) : shade(hill, -0.12));
    }
    for (let x = 0; x < W; x++) {
      const h2 = 7 + Math.sin(x / 15 + 2) * 3;
      px(x, HORIZON - h2, 1, h2, night ? shade(hill, -0.45) : hill);
    }
    px(150, HORIZON - 14, 16, 9, night ? shade(walls[0]!, -0.5) : walls[0]!);
    px(148, HORIZON - 18, 20, 4, night ? shade(roofs[0]!, -0.4) : roofs[0]!);
    px(156, HORIZON - 10, 3, 5, night ? lit : "#4A3A2E");
    for (let i = 0; i < 4; i++) tree(px, env, 60 + i * 26 + r() * 10, HORIZON - 2, 14 + r() * 6);
  } else if (env.locality === "town") {
    for (let i = 0, x = -4; x < W; i++) {
      const w = 22 + Math.floor(r() * 10);
      const hh = 12 + Math.floor(r() * 6);
      const wall = walls[i % walls.length]!;
      const roof = roofs[Math.floor(r() * roofs.length)]!;
      px(x, HORIZON - hh, w, hh, night ? shade(wall, -0.5) : wall);
      for (let k = 0; k < 5; k++) px(x - 2 + k, HORIZON - hh - 5 + k, w + 4 - k * 2, 1, night ? shade(roof, -0.4) : roof);
      px(x + 2, HORIZON - hh - 6, w - 4, 2, night ? shade(roof, -0.4) : roof);
      for (let k = 0; k < Math.floor(w / 8); k++) px(x + 3 + k * 8, HORIZON - hh + 3, 4, 4, night ? (r() < 0.6 ? lit : "#2A2A3A") : "#9CC2D6");
      if (env.snow) px(x - 1, HORIZON - hh - 6, w + 2, 1, "#F4F7FA");
      if (r() < 0.5) tree(px, env, x + w + 2, HORIZON, 12 + r() * 5);
      x += w + 6;
    }
  } else {
    const tall = env.locality === "capital" ? 54 : 38;
    for (let x = -4; x < W; ) {
      const w = 14 + Math.floor(r() * 16);
      const hh = 16 + Math.floor(r() * (tall - 16));
      const base = night ? "#2B2D44" : mixHex(walls[Math.floor(r() * walls.length)]!, "#8A97A6", 0.45);
      px(x, HORIZON - hh, w, hh, base);
      px(x + w - 2, HORIZON - hh, 2, hh, shade(base, -0.12));
      for (let yy = HORIZON - hh + 3; yy < HORIZON - 4; yy += 4) for (let xx = x + 2; xx < x + w - 3; xx += 3) px(xx, yy, 1, 2, night ? (r() < 0.45 ? lit : "#3A3C55") : shade(base, 0.25));
      if (env.snow) px(x, HORIZON - hh, w, 1, "#F4F7FA");
      if (r() < 0.3) px(x + 3, HORIZON - hh - 4, 4, 4, shade(base, -0.2));
      x += w + 1 + Math.floor(r() * 4);
    }
    if (env.locality === "capital") {
      const c = night ? "#3A3C55" : "#B9C2CC";
      px(30, HORIZON - 30, 20, 30, c);
      px(33, HORIZON - 36, 14, 6, c);
      px(36, HORIZON - 40, 8, 4, c);
      px(39, HORIZON - 44, 2, 4, c);
    }
  }
  void frame;
}

function drawGround(px: Px, env: Env, dusk: boolean) {
  const surface = env.locality === "rural" ? (env.climate === "tropical" ? "#B98A5A" : "#B08654") : env.locality === "town" ? "#5C646B" : "#7A8288";
  const s = dusk ? shade(surface, -0.35) : surface;
  px(0, HORIZON, W, H - HORIZON, s);
  const r = rand(`${env.seed}:grit`);
  for (let i = 0; i < 120; i++) px(Math.floor(r() * W), HORIZON + Math.floor(r() * (H - HORIZON)), 1, 1, shade(s, r() < 0.5 ? -0.08 : 0.08));
  if (env.snow) {
    px(0, HORIZON, W, 2, "#EEF2F5");
    for (let i = 0; i < 30; i++) px(Math.floor(r() * W), HORIZON + 2 + Math.floor(r() * 4), 3, 1, "#EEF2F5");
  }
}

function drawFence(px: Px, env: Env, dusk: boolean) {
  if (env.locality === "rural") {
    const wood = dusk ? "#4A3A2E" : "#8A6A44";
    for (let x = 4; x < W; x += 14) px(x, HORIZON - 9, 2, 10, wood);
    px(0, HORIZON - 7, W, 1, wood);
    px(0, HORIZON - 3, W, 1, wood);
    return;
  }
  const metal = dusk ? "#5A5E70" : "#9AA4AA";
  for (let x = 0; x < W; x += 16) px(x, HORIZON - 20, 1, 21, metal);
  px(0, HORIZON - 20, W, 1, metal);
  for (let y = HORIZON - 19; y < HORIZON; y += 2) for (let x = (y % 4) / 2; x < W; x += 3) px(x, y, 1, 1, dusk ? "#4A4E60" : "#B8C0C5");
}

function drawStreetCourt(px: Px, env: Env, dusk: boolean) {
  drawFence(px, env, dusk);
  drawGround(px, env, dusk);
  const line = env.locality === "rural" ? "#E6D3A8" : "#F2F2F2";
  if (env.locality !== "rural") {
    px(0, HORIZON + 6, W, 1, dusk ? shade(line, -0.4) : line);
    px(0, HORIZON + 6, 44, 1, dusk ? shade(line, -0.4) : line);
    px(44, HORIZON + 6, 1, 24, dusk ? shade(line, -0.4) : line);
    px(0, HORIZON + 30, 45, 1, dusk ? shade(line, -0.4) : line);
  }
  drawHoop(px, 26, env.locality === "rural" ? "wood" : env.locality === "town" ? "street" : "city", dusk);
  if (dusk) {
    px(176, 18, 2, HORIZON + 10 - 18, "#3A3E48");
    px(170, 16, 10, 3, "#3A3E48");
    px(170, 19, 10, 1, "#FFE9A8");
  }
}

function drawYard(px: Px, env: Env) {
  const r = rand(`${env.seed}:yard`);
  const wall = WALLS[env.region][Math.floor(r() * 4)]!;
  const roof = ROOF[env.region][Math.floor(r() * 3)]!;
  px(0, 18, 86, HORIZON - 18 + 4, wall);
  for (let y = 22; y < HORIZON; y += 4) px(0, y, 86, 1, shade(wall, -0.06));
  for (let k = 0; k < 8; k++) px(-6 + k * 2, 18 - 8 + k, 98 - k * 4, 1, roof);
  px(0, 10, 92, 2, shade(roof, -0.15));
  if (env.snow) px(-2, 9, 96, 2, "#F4F7FA");
  px(8, 30, 14, 12, "#9CC2D6");
  px(8, 36, 14, 1, wall);
  px(15, 30, 1, 12, wall);
  px(6, 42, 18, 2, shade(wall, -0.2));
  px(40, 40, 38, HORIZON - 40 + 4, "#D2D5D8");
  for (let y = 44; y < HORIZON + 4; y += 5) px(40, y, 38, 1, "#B9BDC1");
  px(28, 44, 9, HORIZON - 44 + 4, "#7A5238");
  px(34, 54, 1, 2, "#E2C044");
  const lawn = env.snow ? "#EEF2F5" : env.climate === "arid" ? "#C9A66B" : env.climate === "tropical" ? "#5FA24E" : env.winter ? "#8E9A6E" : "#6FAE4E";
  px(0, HORIZON + 4, W, H - HORIZON - 4, lawn);
  px(40, HORIZON + 4, 38, H - HORIZON - 4, "#A7ADB2");
  px(86, HORIZON + 4, W - 86, H - HORIZON - 4, mixHex(lawn, "#A7ADB2", 0.25));
  for (let i = 0; i < 80; i++) px(Math.floor(r() * W), HORIZON + 5 + Math.floor(r() * 30), 1, 1, shade(lawn, -0.12));
  px(52, 26, 14, 9, "#F4F4F4");
  px(56, 29, 5, 3, "#E06A4E");
  px(57, 36, 3, 4, "#9AA4AA");
  px(54, 35, 11, 1, "#E0632E");
  for (let i = 0; i < 5; i++) px(55 + i * 2, 36 + (i % 2), 1, 4, "#F2F2F2");
  tree(px, env, 176, HORIZON + 4, 22);
}

function drawSnowfall(px: Px, env: Env, frame: number) {
  const r = rand(`${env.seed}:snow`);
  for (let i = 0; i < 40; i++) {
    const x = (r() * W + Math.sin((frame + i * 7) / 9) * 3) % W;
    const y = (r() * H + frame * (0.6 + r() * 0.6)) % H;
    px(x, y, 1, 1, "#FFFFFF");
  }
}

function drawHoop(px: Px, x: number, type: "wood" | "street" | "city" | "gym" | "pro", dusk = false) {
  const d = (c: string) => (dusk ? shade(c, -0.35) : c);
  const rimY = HORIZON - 34;
  if (type === "wood") {
    px(x - 6, rimY - 8, 3, HORIZON - rimY + 14, d("#7A5A3A"));
    px(x - 4, rimY - 12, 16, 12, d("#C9A26A"));
    for (let i = 0; i < 4; i++) px(x - 4, rimY - 12 + i * 3, 16, 1, d("#B08A55"));
    px(x + 10, rimY, 10, 1, d("#B04A2E"));
    return;
  }
  if (type === "street" || type === "city") {
    px(x - 8, rimY - 6, 3, HORIZON - rimY + 14, d("#59606A"));
    px(x - 6, rimY - 6, 8, 2, d("#59606A"));
    px(x, rimY - 13, 16, 12, d(type === "city" ? "#C9D1D6" : "#F2F2F2"));
    px(x + 5, rimY - 9, 6, 5, d("#E06A4E"));
    px(x + 6, rimY - 8, 4, 3, d(type === "city" ? "#C9D1D6" : "#F2F2F2"));
    px(x + 10, rimY, 11, 1, d("#E0632E"));
    for (let i = 0; i < 5; i++) px(x + 11 + i * 2, rimY + 1 + (i % 2), 1, type === "city" ? 4 : 6, d(type === "city" ? "#A8B0B6" : "#F2F2F2"));
    return;
  }
  if (type === "gym") {
    px(x - 4, 6, 2, rimY - 18, "#6B7178");
    px(x - 4, rimY - 14, 10, 2, "#6B7178");
  } else {
    px(x - 14, rimY - 4, 6, HORIZON - rimY + 18, "#2B2F36");
    px(x - 16, HORIZON + 10, 12, 6, "#2B2F36");
    px(x - 10, rimY - 10, 12, 3, "#2B2F36");
  }
  px(x, rimY - 15, 18, 13, "#E8F1F5");
  px(x, rimY - 15, 18, 1, "#AEB8BE");
  px(x + 5, rimY - 10, 8, 6, "#E0632E");
  px(x + 6, rimY - 9, 6, 4, "#E8F1F5");
  px(x + 11, rimY, 11, 1, "#E0632E");
  for (let i = 0; i < 5; i++) px(x + 12 + i * 2, rimY + 1 + (i % 2), 1, 7 - (i % 2), "#F4F4F4");
}

/* ------------------------------------------------------------ indoor */

function woodFloor(px: Px, env: Env, keyColor: string | null, light = 0) {
  const base = shade("#C99A5B", light);
  px(0, HORIZON, W, H - HORIZON, base);
  for (let y = HORIZON + 3; y < H; y += 4) px(0, y, W, 1, shade(base, -0.07));
  const r = rand(`${env.seed}:planks`);
  for (let i = 0; i < 40; i++) px(Math.floor(r() * W), HORIZON + 1 + Math.floor(r() * 10) * 4, 1, 3, shade(base, -0.1));
  if (keyColor) px(0, HORIZON + 4, 58, H - HORIZON - 10, mixHex(base, keyColor, 0.55));
  px(0, HORIZON + 3, W, 1, "#F4F4F4");
  px(58, HORIZON + 4, 1, H - HORIZON - 10, "#F4F4F4");
  px(0, H - 6, W, 1, "#F4F4F4");
  px(0, HORIZON + 8, W, 2, mixHex(base, "#FFFFFF", 0.18));
}

function crowd(px: Px, env: Env, frame: number, o: { y0: number; rows: number; density: number; teamShare: number; seat: string; dark: boolean }) {
  const r = rand(`${env.seed}:crowd:${env.kit.primary}`);
  const others = ["#3A6EA5", "#C0504D", "#E8B04A", "#F4F4F4", "#2B2F36", "#6C8EAD", "#9BBB59"];
  for (let row = 0; row < o.rows; row++) {
    const y = o.y0 + row * 7;
    px(0, y + 5, W, 2, shade(o.seat, -0.15));
    for (let x = 1 + (row % 2); x < W - 1; x += 3) {
      const u = r();
      const skin = SKIN[Math.floor(r() * 6)]!;
      const shirt = r() < o.teamShare ? (r() < 0.75 ? env.kit.primary : env.kit.secondary) : others[Math.floor(r() * others.length)]!;
      const cheer = frame > 0 && hashString(`${x}:${row}:${Math.floor(frame / 3)}`) % 23 === 0;
      if (u > o.density) {
        px(x, y + 3, 2, 3, o.seat);
        continue;
      }
      const lift = cheer ? -1 : 0;
      px(x, y + 1 + lift, 2, 2, o.dark ? shade(skin, -0.2) : skin);
      px(x, y + 3 + lift, 2, 3, o.dark ? shade(shirt, -0.15) : shirt);
      if (cheer) px(x - 1, y - 1, 1, 2, skin);
    }
  }
}

function scoreboard(px: Px, x: number, y: number, home: number, away: number) {
  px(x, y, 30, 12, "#14171C");
  px(x, y, 30, 1, "#3A3F47");
  drawDigits(px, home % 1000, x + 8, y + 4, "#FF5A3C");
  drawDigits(px, away % 1000, x + 22, y + 4, "#FFC04A");
}

function drawGym(px: Px, env: Env, club: boolean, s: LifeState, frame: number) {
  const wall = club ? "#C7CDD3" : "#DDD6C6";
  px(0, 0, W, HORIZON, wall);
  for (let y = 4; y < HORIZON; y += 6) px(0, y, W, 1, shade(wall, -0.05));
  for (let i = 0; i < 6; i++) {
    px(60 + i * 22, 6, 14, 10, "#A9CFE0");
    px(60 + i * 22, 11, 14, 1, shade(wall, -0.2));
    px(66 + i * 22, 6, 1, 10, shade(wall, -0.2));
  }
  px(0, HORIZON - 14, W, 10, env.kit.primary);
  px(0, HORIZON - 15, W, 1, env.kit.secondary);
  px(0, HORIZON - 4, W, 4, shade(env.kit.primary, -0.3));
  px(6, HORIZON - 26, 30, 22, shade(env.kit.primary, -0.15));
  for (let i = 0; i < 3; i++) {
    const bx = 74 + i * 26;
    px(bx, 20, 14, 2, env.kit.secondary);
    px(bx, 22, 14, 7, env.kit.primary);
    for (let k = 0; k < 7; k++) px(bx + k, 29 + k, 14 - k * 2, 1, env.kit.primary);
    px(bx + 4, 24, 6, 2, env.kit.ink);
  }
  const g = s.lastGame;
  scoreboard(px, 152, 20, g?.teamScore ?? 0, g?.oppScore ?? 0);
  if (club) {
    const r = rand(`${env.seed}:parents`);
    px(130, HORIZON - 4, 62, 4, "#8A6A44");
    for (let i = 0; i < 9; i++) {
      const x = 134 + i * 6 + Math.floor(r() * 2);
      const skin = SKIN[Math.floor(r() * 6)]!;
      const lift = frame && hashString(`p${i}:${Math.floor(frame / 4)}`) % 9 === 0 ? -1 : 0;
      px(x, HORIZON - 12 + lift, 3, 3, skin);
      px(x - 1, HORIZON - 9 + lift, 5, 5, ["#3A6EA5", "#C0504D", "#E8B04A", "#6C8EAD", "#9BBB59"][Math.floor(r() * 5)]!);
    }
  } else {
    for (let k = 0; k < 6; k++) px(128, HORIZON - 6 - k * 3, 64, 2, k % 2 ? "#A07A4C" : "#B88E5A");
  }
  woodFloor(px, env, env.kit.primary, 0.05);
  drawHoop(px, 22, "gym");
}

function drawHall(px: Px, env: Env, frame: number) {
  px(0, 0, W, HORIZON, "#9C5A43");
  for (let y = 2; y < HORIZON; y += 4) {
    px(0, y, W, 1, "#84483A");
    for (let x = (y / 4) % 2 ? 0 : 6; x < W; x += 12) px(x, y - 3, 1, 3, "#84483A");
  }
  for (let i = 0; i < 4; i++) px(30 + i * 44, 4, 22, 2, frame && (frame + i) % 47 === 0 ? "#C9D3D6" : "#F4FAFC");
  px(120, 14, 40, 22, "#E9E4D8");
  px(122, 16, 36, 2, env.kit.primary);
  for (let i = 0; i < 4; i++) px(124, 21 + i * 4, 30 - i * 5, 1, "#9AA0A6");
  for (let i = 0; i < 7; i++) {
    px(110 + i * 11, HORIZON - 8, 6, 1, "#5A6066");
    px(110 + i * 11, HORIZON - 8, 1, 8, "#5A6066");
    px(115 + i * 11, HORIZON - 8, 1, 8, "#5A6066");
  }
  woodFloor(px, env, null, -0.05);
  drawHoop(px, 22, "gym");
}

function drawArena(px: Px, env: Env, frame: number, o: { density: number; teamShare: number; rows: number; dark: boolean; led: boolean; banners: boolean; jumbo: boolean; score?: [number, number] }) {
  const ceil = o.dark ? "#12151A" : "#2A2F36";
  px(0, 0, W, HORIZON, ceil);
  const y0 = HORIZON - 8 - o.rows * 7;
  crowd(px, env, frame, { y0, rows: o.rows, density: o.density, teamShare: o.teamShare, seat: o.dark ? "#2A2E36" : "#3A4048", dark: o.dark });
  if (o.jumbo) {
    for (let i = 0; i < 5; i++) {
      const lx = 20 + i * 38;
      for (let k = 0; k < 10; k++) px(lx - k, 2 + k, 2 + k * 2, 1, "rgba(255,248,220,0.05)");
      px(lx - 1, 1, 3, 2, "#FFF6D8");
    }
    px(80, 0, 2, 4, "#3A3F47");
    px(110, 0, 2, 4, "#3A3F47");
    px(72, 4, 48, 22, "#0B0D10");
    px(74, 6, 44, 18, shade(env.kit.primary, -0.25));
    px(74, 6, 44, 2, env.kit.secondary);
    if (o.score) {
      drawDigits(px, o.score[0], 85, 12, env.kit.ink, 2);
      px(95, 15, 2, 2, env.kit.ink);
      drawDigits(px, o.score[1], 107, 12, env.kit.ink, 2);
    } else if (env.kit.number !== null) drawDigits(px, env.kit.number, 96, 11, env.kit.ink, 2);
  } else {
    scoreboard(px, 81, 3, 0, 0);
  }
  if (o.banners) for (let i = 0; i < 4; i++) {
    const bx = 8 + i * 15 + (o.jumbo ? 0 : 120);
    px(bx, 1, 10, 12, i % 2 ? env.kit.secondary : env.kit.primary);
    px(bx + 2, 4, 6, 1, i % 2 ? env.kit.primary : env.kit.ink);
    px(bx + 2, 7, 6, 1, i % 2 ? env.kit.primary : env.kit.ink);
  }
  if (o.led) {
    px(0, HORIZON - 7, W, 7, "#0B0D10");
    const off = frame ? Math.floor(frame * 1.5) % 48 : 0;
    for (let x = -48; x < W; x += 48) {
      px(x + off, HORIZON - 6, 30, 5, env.kit.primary);
      px(x + off + 2, HORIZON - 4, 26, 1, env.kit.ink);
      px(x + off + 30, HORIZON - 6, 18, 5, "#1E2A3A");
      px(x + off + 33, HORIZON - 4, 12, 1, "#7FD4FF");
    }
  } else {
    px(0, HORIZON - 7, W, 7, shade(env.kit.primary, -0.35));
    px(0, HORIZON - 7, W, 1, env.kit.secondary);
  }
  woodFloor(px, env, env.kit.primary, o.jumbo ? 0.08 : 0);
  if (o.jumbo) {
    px(176, HORIZON + 12, 16, 14, mixHex("#C99A5B", env.kit.secondary, 0.6));
    px(172, HORIZON + 15, 20, 8, mixHex("#C99A5B", env.kit.secondary, 0.6));
    px(178, HORIZON + 16, 14, 6, mixHex("#C99A5B", env.kit.primary, 0.7));
  }
  drawHoop(px, 22, "pro");
}

/* ------------------------------------------------------------ people */

interface Figure {
  x: number;
  footY: number;
  h: number;
  skin: string;
  hair: string;
  style: number;
  age: number;
  kit: Kit;
  facing: 1 | -1;
  pose: "dribble" | "defend" | "stand" | "suit" | "polo";
  frame: number;
}

function drawPlayer(px: Px, f: Figure) {
  const { x, footY, h, facing } = f;
  const kid = f.age < 12;
  const head = Math.max(5, Math.round(h * (kid ? 0.22 : 0.16)));
  const torso = Math.max(5, Math.round(h * 0.32));
  const legs = h - head - torso - 1;
  const w = Math.max(5, Math.round(h * (kid ? 0.3 : 0.25)));
  const top = footY - h;
  const left = Math.round(x - w / 2);
  const skinD = shade(f.skin, -0.18);
  const suit = f.pose === "suit";
  const polo = f.pose === "polo";
  const shirt = suit ? "#20242C" : f.kit.primary;
  const shortsC = suit ? "#20242C" : polo ? "#2B2F36" : f.kit.uniform ? f.kit.primary : "#2B2F36";
  const stance = f.pose === "defend" ? 1 : 0;
  const legW = Math.max(2, Math.floor(w / 2) - 1);
  const shortsH = suit ? legs : Math.max(2, Math.round(legs * 0.42));
  for (const [i, lx] of [left + stance * -1, left + w - legW + stance].entries()) {
    px(lx, footY - legs, legW, legs, i ? skinD : f.skin);
    px(lx, footY - legs, legW, shortsH, i ? shade(shortsC, -0.12) : shortsC);
    if (!suit) px(lx, footY - 4, legW, 2, "#F4F4F4");
    px(lx + (facing < 0 ? -1 : 0), footY - 2, legW + 1, 2, suit ? "#111111" : f.kit.uniform ? shade(f.kit.secondary, -0.1) : "#E9E9E9");
  }
  if (f.kit.uniform && !suit && !polo) px(left, footY - legs, 1, shortsH, f.kit.secondary);
  const ty = top + head + 1;
  px(left, ty, w, torso, shirt);
  px(left + w - 1, ty, 1, torso, shade(shirt, -0.15));
  const tank = f.kit.uniform && !suit && !polo;
  if (tank) {
    px(left, ty, 1, torso - 2, f.skin);
    px(left + w - 1, ty, 1, torso - 2, skinD);
    px(left + Math.floor(w / 2) - 1, ty, 2, 1, f.skin);
    px(left + 1, ty, 1, 2, f.kit.secondary);
    px(left + w - 2, ty, 1, 2, f.kit.secondary);
    if (f.kit.number !== null && w >= 9 && torso >= 8) drawDigits(px, f.kit.number, x, ty + 2, f.kit.ink);
    else if (f.kit.number !== null) px(left + 2, ty + 3, w - 4, 1, f.kit.ink);
  } else if (suit) {
    px(left + Math.floor(w / 2) - 1, ty, 2, Math.round(torso * 0.6), "#F4F4F4");
    px(left + Math.floor(w / 2), ty + 1, 1, Math.round(torso * 0.5), f.kit.primary);
  } else if (polo) {
    px(left + Math.floor(w / 2) - 1, ty, 3, 2, f.kit.secondary);
  }
  const armLen = Math.round(torso * 0.95);
  const frontX = facing < 0 ? left - 1 : left + w;
  const backX = facing < 0 ? left + w : left - 1;
  const sleeve = tank ? f.skin : shirt;
  px(backX, ty + 1, 1, armLen, shade(sleeve === f.skin ? f.skin : shirt, -0.2));
  if (f.pose === "dribble") {
    const phase = f.frame ? (f.frame % 8) / 8 : 0;
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    const handY = ty + armLen - 1;
    const handX = frontX + facing * 2;
    px(frontX, ty + 1, 1, 3, sleeve);
    px(frontX + (facing < 0 ? -1 : 0), ty + 3, 2, armLen - 3, f.skin);
    const ballY = Math.round(handY + 1 + (footY - 4 - handY - 1) * (f.frame ? tri : 0.6));
    const bx = handX + (facing < 0 ? -3 : 0);
    px(bx, ballY, 4, 4, "#E07A3E");
    px(bx + 1, ballY, 2, 1, "#F09A5E");
    px(bx, ballY + 2, 4, 1, "#7A3A1E");
    px(bx + 2, ballY, 1, 4, "#7A3A1E");
  } else if (f.pose === "defend") {
    px(frontX, ty + 1, 1, 2, sleeve);
    px(frontX + facing * 1, ty - 2 + (f.frame % 6 < 3 ? 0 : 1), 1, 4, f.skin);
    px(backX - facing, ty + 2, 1, 3, f.skin);
  } else if (polo) {
    px(frontX, ty + 1, 1, armLen, f.skin);
    px(frontX + facing * 1 - (facing < 0 ? 4 : 0), ty + 3, 5, 7, "#F4F4F4");
    px(frontX + facing * 1 - (facing < 0 ? 4 : 0), ty + 3, 5, 1, "#8A6A44");
    for (let i = 0; i < 3; i++) px(frontX + facing * 1 - (facing < 0 ? 3 : -1), ty + 5 + i * 2, 3, 1, "#9AA0A6");
  } else {
    px(frontX, ty + 1, 1, armLen, sleeve === shirt ? shirt : f.skin);
    px(frontX, ty + armLen - 1, 1, 2, f.skin);
  }
  const hx = Math.round(x - head / 2);
  px(hx, top, head, head + 1, f.skin);
  px(facing < 0 ? hx + head - 1 : hx, top + 1, 1, head - 1, skinD);
  px(Math.round(x - 1), top + head, 2, 1, skinD);
  const hairStyles: (() => void)[] = [
    () => px(hx, top - 1, head, 2, f.hair),
    () => (px(hx - 1, top - 1, head + 2, 2, f.hair), px(facing < 0 ? hx + head : hx - 1, top + 1, 1, 2, f.hair)),
    () => px(hx, top, head, 1, f.hair),
    () => (px(hx - 1, top - 2, head + 2, 3, f.hair), px(hx - 1, top + 1, 1, 2, f.hair), px(hx + head, top + 1, 1, 2, f.hair)),
    () => (px(hx, top - 1, head, 1, f.hair), px(hx + 1, top - 2, head - 2, 1, f.hair)),
  ];
  hairStyles[f.style % hairStyles.length]!();
  px(facing < 0 ? hx + 1 : hx + head - 2, top + Math.round(head * 0.45), 1, 1, "#1B1412");
  if (f.kit.uniform && !suit && !polo && !kid && hashString(`${f.kit.primary}:${f.skin}:band`) % 3 === 0) px(hx, top + 1, head, 1, f.kit.secondary);
}

/* ------------------------------------------------------------ special scenes */

function drawNursery(px: Px, s: LifeState, env: Env, frame: number, hero: Hero) {
  const r = rand(`${env.seed}:room`);
  const wall = ["#E6EEF4", "#F2E8DA", "#E8F0E4", "#F4E6EA"][Math.floor(r() * 4)]!;
  px(0, 0, W, 74, wall);
  for (let x = 0; x < W; x += 12) px(x, 0, 1, 74, shade(wall, -0.04));
  px(0, 70, W, 4, shade(wall, -0.18));
  px(0, 74, W, H - 74, "#B08A62");
  for (let y = 78; y < H; y += 5) px(0, y, W, 1, "#A07A54");
  px(56, 84, 76, 18, "#C9D8E6");
  px(58, 86, 72, 14, "#DCE6F0");
  px(18, 14, 36, 30, "#FFFFFF");
  const outside = env.snow ? "#DDE6EE" : env.winter ? "#B9CBD8" : "#9CCBE6";
  px(20, 16, 15, 12, outside);
  px(37, 16, 15, 12, outside);
  px(20, 30, 15, 12, env.snow ? "#F4F7FA" : outside);
  px(37, 30, 15, 12, env.snow ? "#F4F7FA" : outside);
  if (!env.snow) {
    px(24, 34, 6, 8, "#6FAE4E");
    px(42, 36, 8, 6, "#6FAE4E");
  }
  px(16, 12, 40, 2, "#C9B8A0");
  px(16, 44, 40, 2, "#C9B8A0");
  const cribX = 112;
  px(cribX, 44, 56, 3, "#E2C69A");
  px(cribX, 70, 56, 3, "#E2C69A");
  for (let i = 0; i < 8; i++) px(cribX + 2 + i * 7, 47, 2, 23, "#E2C69A");
  px(cribX, 40, 3, 36, "#C9A97A");
  px(cribX + 53, 40, 3, 36, "#C9A97A");
  const spin = frame ? Math.round(Math.sin(frame / 6) * 3) : 0;
  px(cribX + 26, 18, 1, 10, "#9AA0A6");
  px(cribX + 16, 27, 22, 1, "#9AA0A6");
  px(cribX + 14 + spin, 28, 4, 4, "#E06A4E");
  px(cribX + 25, 28 - spin * 0, 4, 4, "#F2C14E");
  px(cribX + 36 - spin, 28, 4, 4, "#48B9AB");
  const age = s.ageMonths / 12;
  const bob = frame ? Math.round(Math.sin(frame / 3)) : 0;
  px(70, 88 + bob, 7, 7, "#E07A3E");
  px(71, 88 + bob, 3, 1, "#F09A5E");
  px(70, 91 + bob, 7, 1, "#7A3A1E");
  if (age < 1) {
    px(cribX + 18, 58, 16, 9, "#F2E6C9");
    px(cribX + 30, 54, 8, 8, hero.skin);
    px(cribX + 33, 53, 4, 1, hero.hair);
    px(cribX + 35, 57, 1, 1, "#1B1412");
  } else {
    const bx = 92;
    px(bx, 82, 12, 8, "#F2E6C9");
    px(bx + 2, 90, 3, 3, hero.skin);
    px(bx + 8, 90, 3, 3, hero.skin);
    px(bx + 1, 73, 10, 9, hero.skin);
    px(bx + 3, 72, 6, 1, hero.hair);
    px(bx + 3, 77, 1, 1, "#1B1412");
    px(bx + 8, 77, 1, 1, "#1B1412");
    px(bx - 2 + (frame % 10 < 5 ? 0 : 1), 84, 2, 4, hero.skin);
  }
}

function drawDraft(px: Px, s: LifeState, env: Env, frame: number, hero: Hero, heightPx: number) {
  px(0, 0, W, H, "#0E1430");
  const r = rand(`${env.seed}:stars`);
  for (let i = 0; i < 60; i++) px(Math.floor(r() * W), Math.floor(r() * 60), 1, 1, frame && (i + frame) % 13 === 0 ? "#FFFFFF" : "#5A6AA0");
  px(48, 6, 96, 44, "#05070F");
  px(50, 8, 92, 40, shade(env.kit.primary, -0.2));
  px(50, 8, 92, 3, env.kit.secondary);
  const pick = s.achievements.drafted?.pick ?? 0;
  drawDigits(px, pick, 96, 20, env.kit.ink, 3);
  px(0, 74, W, H - 74, "#1B2240");
  px(0, 74, W, 2, "#3A4680");
  for (let x = 0; x < W; x += 8) px(x, 76, 4, H - 76, "#202850");
  px(30, 54, 22, 22, "#2A3260");
  px(30, 54, 22, 2, "#C9D3F0");
  px(40, 48, 1, 6, "#9AA0A6");
  px(39, 47, 3, 2, "#2B2F36");
  for (let i = 0; i < 6; i++) px(4 + i * 32, 0, 2, 74, "rgba(255,255,255,0.03)");
  drawPlayer(px, { x: 112, footY: 94, h: heightPx, ...hero, kit: env.kit, facing: -1, pose: "suit", frame });
  const top = 94 - heightPx;
  const head = Math.max(5, Math.round(heightPx * 0.16));
  px(112 - head / 2 - 1, top - 2, head + 2, 3, env.kit.primary);
  px(112 - head / 2 - 3, top, 4, 1, env.kit.primary);
  px(112 - 1, top - 1, 2, 1, env.kit.secondary);
  const flash = frame && frame % 9 === 0;
  if (flash) for (let i = 0; i < 4; i++) px(8 + i * 50, 70, 3, 3, "#FFFFFF");
}

function coachScore(s: LifeState): [number, number] {
  const home = 45 + (hashString(`${s.seed}:${s.ageMonths}:h`) % 50);
  const away = Math.min(99, Math.max(40, home - 15 + (hashString(`${s.seed}:${s.ageMonths}:a`) % 31)));
  return [home, away];
}

function drawCoach(px: Px, s: LifeState, env: Env, frame: number, hero: Hero, heightPx: number) {
  const nba = (s.after?.step ?? 0) >= 4;
  drawArena(px, env, frame, { density: nba ? 0.95 : 0.4 + (s.after?.step ?? 0) * 0.12, teamShare: 0.6, rows: nba ? 7 : 5, dark: (s.after?.step ?? 0) >= 2, led: (s.after?.step ?? 0) >= 2, banners: nba, jumbo: nba, score: coachScore(s) });
  const playerKit = { ...env.kit, uniform: true, number: 3 + (hashString(`${s.seed}:p1`) % 30) };
  const opp = opponentKit(s.seed, s.after?.employer ?? null, `coach:${s.after?.years.length ?? 0}`);
  drawPlayer(px, { x: 92, footY: FEET - 2, h: 38, skin: SKIN[hashString(`${s.seed}:c1`) % 6]!, hair: HAIR[0]!, style: 2, age: 24, kit: opp, facing: 1, pose: "defend", frame });
  drawPlayer(px, { x: 112, footY: FEET, h: 40, skin: SKIN[hashString(`${s.seed}:c2`) % 6]!, hair: HAIR[0]!, style: 0, age: 24, kit: playerKit, facing: -1, pose: "dribble", frame });
  px(140, FEET - 2, 52, 2, "#F4F4F4");
  drawPlayer(px, { x: 164, footY: H - 4, h: Math.min(heightPx, 40), ...hero, age: 40, kit: env.kit, facing: -1, pose: "polo", frame });
}

function drawStudio(px: Px, s: LifeState, env: Env, frame: number, hero: Hero) {
  px(0, 0, W, H, "#141A28");
  for (let i = 0; i < 3; i++) {
    const sx = 18 + i * 54;
    px(sx, 10, 48, 30, "#05070F");
    px(sx + 2, 12, 44, 26, i === 1 ? "#1F6FD0" : "#2A3550");
    if (i === 1) {
      px(sx + 4, 30, 40, 6, "#C99A5B");
      px(sx + 6, 22, 6, 8, "#E8F1F5");
      px(sx + 26, 20, 8, 10, env.kit.primary);
    } else {
      for (let k = 0; k < 4; k++) px(sx + 6, 16 + k * 5, 20 + ((k * 7 + frame) % 14), 2, k % 2 ? "#7FD4FF" : "#FFC04A");
    }
  }
  px(0, 72, W, 4, "#2A3550");
  drawPlayer(px, { x: 96, footY: 98, h: 40, ...hero, age: 40, kit: env.kit, facing: 1, pose: "suit", frame });
  px(30, 78, 132, 24, "#E8ECF2");
  px(30, 78, 132, 2, "#FFFFFF");
  px(30, 98, 132, 4, "#B9C2CC");
  px(84, 84, 24, 8, env.kit.primary);
  px(70, 72, 2, 6, "#2B2F36");
  px(68, 70, 6, 2, "#2B2F36");
  void s;
}

function drawPodcast(px: Px, s: LifeState, env: Env, frame: number, hero: Hero) {
  px(0, 0, W, H, "#221C24");
  for (let y = 6; y < 66; y += 10) for (let x = 6 + ((y / 10) % 2) * 5; x < W - 6; x += 10) px(x, y, 8, 8, (x + y) % 20 ? "#2E2632" : "#352B3A");
  const lit = Math.floor(frame / 18) % 2 === 0;
  px(80, 8, 32, 10, "#05070F");
  px(81, 9, 30, 8, lit ? "#D6245F" : "#5A1A2E");
  px(85, 12, 22, 2, lit ? "#FFD6E0" : "#8A4A5E");
  px(150, 22, 22, 28, "#3A2E40");
  px(152, 24, 18, 24, env.kit.primary);
  px(156, 30, 10, 12, env.kit.secondary);
  const guest = { ...env.kit, uniform: false, primary: "#4A5260", secondary: "#F4F4F4", number: null };
  drawPlayer(px, { x: 62, footY: 98, h: 40, ...hero, age: 40, kit: { ...env.kit, uniform: false, number: null }, facing: 1, pose: "suit", frame });
  drawPlayer(px, { x: 132, footY: 98, h: 42, skin: SKIN[hashString(`${s.seed}:guest:${s.ageMonths >> 3}`) % 6]!, hair: HAIR[0]!, style: 2, age: 30, kit: guest, facing: -1, pose: "suit", frame });
  px(24, 80, 144, 22, "#6B4A32");
  px(24, 80, 144, 2, "#8A6A44");
  for (const [bx, dir] of [[78, 1], [116, -1]] as const) {
    px(bx, 66, 2, 14, "#1A1A1E");
    px(bx + dir * 2 - (dir < 0 ? 4 : 0), 64, 6, 2, "#1A1A1E");
    px(bx + dir * 6 - (dir < 0 ? 4 : 0), 62, 4, 6, "#6A6A76");
    px(bx + dir * 6 - (dir < 0 ? 4 : 0) + 1, 63, 2, 1, "#9AA0A6");
  }
  px(90, 74, 12, 6, "#2B2F36");
  px(92, 75, 8, 4, "#7FD4FF");
}

function drawScout(px: Px, s: LifeState, env: Env, frame: number, hero: Hero) {
  px(0, 0, W, H, "#1A1E26");
  woodFloor(px, env, null, -0.1);
  px(0, 0, W, 30, "#12151A");
  drawHoop(px, 22, "pro");
  for (let row = 0; row < 4; row++) {
    const y = 58 + row * 13;
    px(0, y + 8, W, 5, "#3A4048");
    for (let x = 4; x < W; x += 9) px(x, y + 2, 7, 6, "#4A5260");
  }
  drawPlayer(px, { x: 120, footY: 84, h: 36, ...hero, age: 40, kit: { ...env.kit, uniform: false, number: null }, facing: -1, pose: "stand", frame });
  px(108, 70, 9, 6, "#F4F4F4");
  px(109, 71, 7, 1, "#9AA0A6");
  px(109, 73, 5, 1, "#9AA0A6");
  px(104, 75, 32, 9, "#4A5260");
  void s;
}

function drawTrainer(px: Px, s: LifeState, env: Env, frame: number, hero: Hero, heightPx: number) {
  drawGym(px, { ...env, kit: { ...env.kit, primary: "#3A4048", secondary: env.kit.primary } }, true, { ...s, lastGame: null } as LifeState, frame);
  for (let i = 0; i < 4; i++) {
    const cx = 70 + i * 14;
    px(cx, FEET - 3, 4, 3, "#F28C28");
    px(cx + 1, FEET - 5, 2, 2, "#F28C28");
  }
  const client = { ...env.kit, uniform: true, primary: "#2B2F36", secondary: "#F4F4F4", ink: "#F4F4F4", number: 1 + (hashString(`${s.seed}:client`) % 30) };
  drawPlayer(px, { x: 116, footY: FEET, h: 42, skin: SKIN[hashString(`${s.seed}:cl`) % 6]!, hair: HAIR[0]!, style: 3, age: 23, kit: client, facing: -1, pose: "dribble", frame });
  drawPlayer(px, { x: 158, footY: FEET + 4, h: Math.min(heightPx, 40), ...hero, age: 40, kit: { ...env.kit, uniform: false, number: null }, facing: -1, pose: "stand", frame });
}

/* ------------------------------------------------------------ share card */

export interface SharePoster {
  tier: string;
  born: string;
  team: string | null;
  route: string[];
  link: string;
  height: string;
  seasons: string;
  peak: string | null;
  draft: string | null;
  nbaGames: number;
  earnings: string | null;
  honors: string | null;
  ended: string;
}

const POSTER_W = 1152;
const POSTER_H = 1440;
const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function lumOf(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function posterAccent(primary: string, secondary: string) {
  if (lumOf(primary) >= 0.22) return primary;
  if (lumOf(secondary) >= 0.22) return secondary;
  return mixHex(primary, "#FFFFFF", 0.62);
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= maxW) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = word;
    if (lines.length === maxLines - 1) break;
  }
  if (lines.length < maxLines && cur) lines.push(ellipsize(ctx, cur, maxW));
  else if (lines.length) lines[lines.length - 1] = ellipsize(ctx, lines[lines.length - 1]!, maxW);
  return lines;
}

/** 1152×1440 career poster. Returns a PNG blob. */
export async function shareCardPng(s: LifeState, poster: SharePoster): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = POSTER_W;
  c.height = POSTER_H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const kit = kitFor(s.seed, s.placement.node, s.placement.teamName);
  const accent = posterAccent(kit.primary, kit.secondary);
  const ink = "#0C0E12";
  const paper = "#171B22";
  const muted = "#9AA3B2";
  const text = "#F5F7FA";

  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  const scene = document.createElement("canvas");
  scene.width = SCENE_W;
  scene.height = SCENE_H;
  const sctx = scene.getContext("2d");
  const sceneH = SCENE_H * 6;
  if (sctx) {
    sctx.imageSmoothingEnabled = false;
    drawScene(sctx, s, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene, 0, 0, SCENE_W * 6, sceneH);
  }
  const fade = ctx.createLinearGradient(0, sceneH - 220, 0, sceneH);
  fade.addColorStop(0, "rgba(12,14,18,0)");
  fade.addColorStop(1, ink);
  ctx.fillStyle = fade;
  ctx.fillRect(0, sceneH - 220, POSTER_W, 220);
  ctx.fillStyle = accent;
  ctx.fillRect(0, sceneH - 8, POSTER_W, 8);

  if (kit.number !== null) {
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = accent;
    ctx.font = `800 340px ${SANS}`;
    ctx.textAlign = "right";
    ctx.fillText(String(kit.number), POSTER_W - 36, sceneH + 250);
    ctx.restore();
  }

  const portraitSize = 256;
  const portrait = document.createElement("canvas");
  portrait.width = portraitSize;
  portrait.height = portraitSize;
  const pctx = portrait.getContext("2d");
  const px = 56;
  const py = sceneH - 168;
  if (pctx) {
    pctx.imageSmoothingEnabled = false;
    drawPortrait(pctx, s, portraitSize);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.roundRect(px - 8, py - 8, portraitSize + 16, portraitSize + 16, 28);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(px, py, portraitSize, portraitSize, 22);
    ctx.clip();
    ctx.drawImage(portrait, px, py, portraitSize, portraitSize);
    ctx.restore();
  }

  const tx = px + portraitSize + 36;
  const tw = POSTER_W - tx - 56;
  let ty = sceneH + 40;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = accent;
  ctx.font = `700 22px ${SANS}`;
  ctx.letterSpacing = "3px";
  ctx.fillText(s.unicorn ? "ONE SHOT  ·  UNICORN" : "ONE SHOT", tx, ty);
  ctx.letterSpacing = "0px";
  ty += 18;
  ctx.fillStyle = text;
  ctx.font = `700 58px ${SANS}`;
  const nameLines = wrapLines(ctx, s.identity.displayName, tw, 2);
  for (const line of nameLines) {
    ty += 64;
    ctx.fillText(line, tx, ty);
  }
  ty += 46;
  ctx.fillStyle = accent;
  ctx.font = `700 30px ${SANS}`;
  ctx.fillText(ellipsize(ctx, poster.tier, tw), tx, ty);
  ty += 38;
  ctx.fillStyle = muted;
  ctx.font = `500 24px ${SANS}`;
  const meta = [poster.born, poster.team].filter(Boolean).join("  ·  ");
  for (const line of wrapLines(ctx, meta, tw, 2)) {
    ctx.fillText(line, tx, ty);
    ty += 32;
  }

  const stats: [string, string][] = [
    ["Height", poster.height],
    ["Seasons", poster.seasons],
    ["Best year", poster.peak ?? "—"],
    ["Left the game", poster.ended],
  ];
  if (poster.draft) stats.push(["Draft", poster.draft]);
  if (poster.nbaGames > 0) stats.push(["NBA games", String(poster.nbaGames)]);
  if (poster.earnings) stats.push(["Career pay", poster.earnings]);

  const gap = 12;
  const cols = 4;
  const tileW = (POSTER_W - 112 - gap * (cols - 1)) / cols;
  const tileH = 108;
  let y = Math.max(py + portraitSize + 36, ty + 20);
  stats.forEach((stat, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 56 + col * (tileW + gap);
    const top = y + row * (tileH + gap);
    ctx.beginPath();
    ctx.roundRect(x, top, tileW, tileH, 18);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = `600 16px ${SANS}`;
    ctx.letterSpacing = "1.5px";
    ctx.fillText(stat[0].toUpperCase(), x + 18, top + 36);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = text;
    ctx.font = `700 32px ${SANS}`;
    ctx.fillText(ellipsize(ctx, stat[1], tileW - 36), x + 18, top + 82);
  });
  y += Math.ceil(stats.length / cols) * (tileH + gap) + 8;

  if (poster.honors) {
    ctx.fillStyle = accent;
    ctx.font = `700 18px ${SANS}`;
    ctx.letterSpacing = "1.5px";
    ctx.fillText("HONORS", 56, y + 22);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = text;
    ctx.font = `600 28px ${SANS}`;
    let hy = y + 64;
    for (const line of wrapLines(ctx, poster.honors, POSTER_W - 112, 2)) {
      ctx.fillText(line, 56, hy);
      hy += 36;
    }
    y = hy + 12;
  }

  const foot = POSTER_H - 96;
  if (poster.route.length) {
    ctx.font = `600 22px ${SANS}`;
    let x = 56;
    let cy = y;
    const chipH = 44;
    const stops = poster.route.slice(-6);
    for (const stop of stops) {
      const label = ellipsize(ctx, stop, 280);
      const w = Math.ceil(ctx.measureText(label).width) + 32;
      if (x + w > POSTER_W - 56) {
        x = 56;
        cy += chipH + 8;
        if (cy + chipH > foot - 12) break;
      }
      ctx.beginPath();
      ctx.roundRect(x, cy, w, chipH, 22);
      ctx.fillStyle = mixHex(accent, ink, 0.72);
      ctx.fill();
      ctx.fillStyle = text;
      ctx.fillText(label, x + 16, cy + 29);
      x += w + 10;
    }
  }

  ctx.fillStyle = paper;
  ctx.fillRect(0, foot, POSTER_W, 96);
  ctx.fillStyle = accent;
  ctx.fillRect(0, foot, POSTER_W, 6);
  ctx.fillStyle = text;
  ctx.font = `700 22px ${SANS}`;
  ctx.fillText("Replay this life", 56, foot + 58);
  ctx.fillStyle = muted;
  ctx.font = `500 22px ${SANS}`;
  const shortLink = poster.link.replace(/^https?:\/\//, "");
  ctx.textAlign = "right";
  ctx.fillText(ellipsize(ctx, shortLink, 640), POSTER_W - 56, foot + 58);
  ctx.textAlign = "left";

  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}
