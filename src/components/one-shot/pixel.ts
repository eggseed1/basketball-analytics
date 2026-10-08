import { hashString } from "@/one-shot/rng";
import type { LifeState, NodeKind } from "@/one-shot/types";

/**
 * Original pixel art for ONE SHOT. Everything here is a pure function of the
 * state plus a frame counter; it never touches the game's random streams.
 */

const SKIN = ["#F3D3B5", "#E2B48C", "#C98E62", "#A86E46", "#7A4C2E", "#55331F"];
const HAIR = ["#1B1412", "#4A2F1D", "#8A5A2B", "#C9A15A"];
const JERSEY: Record<NodeKind, string> = {
  home: "#8A9B9B",
  playground: "#D6AD51",
  "school-team": "#48B9AB",
  "local-club": "#48B9AB",
  "elite-youth": "#5CBF90",
  "us-high-school": "#5CBF90",
  university: "#6E8BD8",
  "local-senior": "#D6AD51",
  "domestic-pro": "#DF668C",
  "foreign-pro": "#DF668C",
  "g-league": "#E07A3E",
  nba: "#2F6FDB",
  unattached: "#8A9B9B",
};

export function jerseyColor(node: NodeKind) {
  return JERSEY[node];
}

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

function painter(ctx: CanvasRenderingContext2D, scale: number): Px {
  return (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x * scale), Math.round(y * scale), Math.round(w * scale), Math.round(h * scale));
  };
}

/** 16x16 head-and-shoulders portrait. */
export function drawPortrait(ctx: CanvasRenderingContext2D, s: Pick<LifeState, "identity" | "ageMonths" | "placement">, size: number) {
  const px = painter(ctx, size / 16);
  const { look } = s.identity;
  const skin = SKIN[look.skin] ?? SKIN[2]!;
  const hair = HAIR[look.hairColor] ?? HAIR[0]!;
  const age = s.ageMonths / 12;
  ctx.clearRect(0, 0, size, size);
  px(0, 0, 16, 16, "#1B262B");
  if (age < 3) {
    px(4, 4, 8, 8, skin);
    px(3, 6, 1, 4, skin);
    px(12, 6, 1, 4, skin);
    px(5, 3, 6, 1, skin);
    px(6, 7, 1, 1, "#1B1412");
    px(9, 7, 1, 1, "#1B1412");
    px(7, 10, 2, 1, "#B5655A");
    px(6, 2, 3, 1, hair);
    px(3, 13, 10, 3, "#F2E6C9");
    return;
  }
  const jersey = jerseyColor(s.placement.node);
  const headW = age < 12 ? 7 : 6;
  const hx = 8 - headW / 2;
  const hy = age < 12 ? 4 : 3;
  px(hx, hy, headW, 7, skin);
  px(hx - 1, hy + 3, 1, 2, skin);
  px(hx + headW, hy + 3, 1, 2, skin);
  const styles = [
    () => px(hx, hy - 1, headW, 2, hair),
    () => (px(hx - 1, hy - 1, headW + 2, 2, hair), px(hx - 1, hy + 1, 1, 2, hair), px(hx + headW, hy + 1, 1, 2, hair)),
    () => px(hx + 1, hy - 1, headW - 2, 1, hair),
    () => (px(hx - 1, hy - 2, headW + 2, 3, hair), px(hx - 2, hy, 1, 3, hair), px(hx + headW + 1, hy, 1, 3, hair)),
    () => (px(hx, hy - 1, headW, 1, hair), px(hx, hy + 6, headW, 1, hair)),
  ];
  styles[look.hair % styles.length]!();
  const eyeY = hy + 3;
  px(hx + 1, eyeY, 1, 1, "#1B1412");
  px(hx + headW - 2, eyeY, 1, 1, "#1B1412");
  px(hx + 2, hy + 5, headW - 4, 1, "#8C4A3E");
  px(7, hy + 7, 2, 1, skin);
  const shoulders = age < 12 ? 10 : age < 16 ? 12 : 14;
  const sx = 8 - shoulders / 2;
  px(sx, hy + 8, shoulders, 16 - hy - 8, jersey);
  px(6, hy + 8, 4, 1, skin);
  px(7, hy + 9, 2, 1, skin);
  if (age >= 12) {
    px(sx, hy + 8, 2, 16, skin);
    px(sx + shoulders - 2, hy + 8, 2, 16, skin);
  }
}

type SceneKind = "nursery" | "outdoor" | "gym" | "arena" | "nba" | "dusk";

export function sceneKind(s: LifeState): SceneKind {
  const age = s.ageMonths / 12;
  if (age < 3) return "nursery";
  if (s.after) return s.after.track === "coach" || s.after.track === "trainer" ? "gym" : "arena";
  switch (s.placement.node) {
    case "home":
    case "playground":
      return "outdoor";
    case "unattached":
      return "dusk";
    case "school-team":
    case "local-club":
    case "elite-youth":
    case "us-high-school":
    case "university":
      return "gym";
    case "nba":
      return "nba";
    default:
      return "arena";
  }
}

export const SCENE_W = 160;
export const SCENE_H = 90;

/** Low-res life scene. `frame` drives the dribble; pass 0 for a still. */
export function drawScene(ctx: CanvasRenderingContext2D, s: LifeState, frame: number) {
  const px = painter(ctx, 1);
  const kind = sceneKind(s);
  const seed = hashString(`${s.seed}:${kind}:${s.placement.teamName ?? ""}`);
  const month = ((s.identity.birthMonthOfYear - 1 + s.ageMonths) % 12) + 1;
  const winter = month === 12 || month <= 2;
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const floorY = 66;
  if (kind === "nursery") {
    px(0, 0, 160, 66, "#22343A");
    px(0, 66, 160, 24, "#3A2E28");
    px(18, 14, 30, 24, "#2E4C55");
    px(19, 15, 13, 10, "#9CC9D6");
    px(34, 15, 13, 10, "#9CC9D6");
    px(19, 27, 13, 10, "#9CC9D6");
    px(34, 27, 13, 10, "#9CC9D6");
    px(96, 40, 44, 4, "#C9A15A");
    for (let i = 0; i < 6; i++) px(98 + i * 7, 44, 2, 22, "#C9A15A");
    px(96, 62, 44, 4, "#C9A15A");
    const bob = frame ? Math.round(Math.sin(frame / 3) * 1) : 0;
    px(70, 56 + bob, 8, 8, "#E07A3E");
    px(70, 59 + bob, 8, 1, "#3A2018");
    drawKid(px, s, 108, 60, 12);
    return;
  }
  if (kind === "outdoor" || kind === "dusk") {
    const sky = kind === "dusk" ? "#3B2F4A" : winter ? "#7C97A6" : "#7FB3C9";
    px(0, 0, 160, floorY, sky);
    if (kind === "dusk") px(0, 40, 160, 26, "#6B4A5E");
    for (let i = 0; i < 5; i++) {
      const bx = (seed >> (i * 3)) % 140;
      const bh = 14 + ((seed >> (i * 2)) % 18);
      px(bx, floorY - bh, 18, bh, kind === "dusk" ? "#2A2335" : "#5D7480");
    }
    for (let x = 0; x < 160; x += 6) px(x, floorY - 16, 1, 16, "#8A9B9B");
    px(0, floorY - 16, 160, 1, "#8A9B9B");
    px(0, floorY, 160, 24, winter ? "#5A6266" : "#4B5559");
    px(0, floorY + 6, 160, 1, "#D6AD51");
    drawHoop(px, 22, floorY, "#E8E8E8", "#C0452E");
  } else {
    const wall = kind === "gym" ? "#3E4A50" : "#1A2226";
    px(0, 0, 160, floorY, wall);
    if (kind === "gym") {
      for (let i = 0; i < 4; i++) px(40 + i * 28, 10, 16, 20, i % 2 ? "#48B9AB" : "#DF668C");
      px(0, 44, 160, 2, "#2A3B41");
    } else {
      const crowdRows = kind === "nba" ? 6 : 4;
      for (let r = 0; r < crowdRows; r++) {
        for (let x = 2; x < 158; x += 3) {
          const h = hashString(`${seed}:${r}:${x}`);
          px(x, 14 + r * 7, 2, 3, SKIN[h % 6]!);
          px(x, 17 + r * 7, 2, 3, ["#2F6FDB", "#DF668C", "#D6AD51", "#8A9B9B", "#48B9AB"][h % 5]!);
        }
      }
      if (kind === "nba") for (let i = 0; i < 8; i++) px(8 + i * 20, 3, 8, 3, "#F5F1D0");
    }
    px(0, floorY, 160, 24, "#B9874F");
    for (let x = 0; x < 160; x += 10) px(x, floorY, 1, 24, "#A97843");
    px(0, floorY + 3, 160, 1, "#F2E6C9");
    drawHoop(px, 22, floorY, "#F2F2F2", "#E0632E");
  }
  const heightPx = Math.max(14, Math.min(34, (s.body.heightCm / 210) * 34));
  const t = frame;
  const bounce = t ? Math.abs(Math.sin(t / 2.2)) : 1;
  drawKid(px, s, 96, floorY + 10, heightPx);
  const handX = 96 + Math.round(heightPx * 0.32);
  const ballY = floorY + 10 - Math.round(heightPx * 0.45 * bounce) - 3;
  px(handX, ballY, 4, 4, "#E07A3E");
  px(handX, ballY + 2, 4, 1, "#3A2018");
}

function drawHoop(px: Px, x: number, floorY: number, board: string, rim: string) {
  px(x - 2, floorY - 46, 3, 46, "#5A6266");
  px(x, floorY - 50, 14, 10, board);
  px(x + 5, floorY - 47, 4, 3, "#E06A4E");
  px(x + 10, floorY - 41, 10, 1, rim);
  for (let i = 0; i < 4; i++) px(x + 11 + i * 2, floorY - 40 + (i % 2), 1, 5, "#F2F2F2");
}

function drawKid(px: Px, s: LifeState, x: number, footY: number, h: number) {
  const skin = SKIN[s.identity.look.skin] ?? SKIN[2]!;
  const hair = HAIR[s.identity.look.hairColor] ?? HAIR[0]!;
  const jersey = jerseyColor(s.placement.node);
  const head = Math.max(4, Math.round(h * 0.2));
  const torso = Math.round(h * 0.36);
  const legs = h - head - torso;
  const w = Math.max(4, Math.round(h * 0.28));
  const top = footY - h;
  px(x - head / 2, top, head, head, skin);
  px(x - head / 2, top, head, 1, hair);
  px(x - w / 2, top + head, w, torso, jersey);
  px(x - w / 2 - 1, top + head + 1, 1, Math.round(torso * 0.8), skin);
  px(x + w / 2, top + head + 1, 1, Math.round(torso * 0.8), skin);
  px(x - w / 2, top + head + torso, Math.max(1, Math.floor(w / 2) - 0.5), legs, "#1B262B");
  px(x + 0.5, top + head + torso, Math.max(1, Math.floor(w / 2) - 0.5), legs, "#1B262B");
  px(x - w / 2, footY - 1, w, 1, "#F2F2F2");
}

/** 1200x630 share card. Returns a PNG blob. */
export async function shareCardPng(s: LifeState, lines: { tier: string; born: string; route: string; facts: string[]; link: string }): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0E1519";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = "#2A3B41";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 1152, 582);
  const portrait = document.createElement("canvas");
  portrait.width = 256;
  portrait.height = 256;
  const pctx = portrait.getContext("2d");
  if (pctx) {
    pctx.imageSmoothingEnabled = false;
    drawPortrait(pctx, s, 256);
    ctx.drawImage(portrait, 64, 150, 256, 256);
  }
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "#8A9B9B";
  ctx.font = `600 22px ${mono}`;
  ctx.fillText("DRBL ARCADE · ONE SHOT", 64, 92);
  ctx.fillStyle = "#DFEBEB";
  ctx.font = `700 58px ${mono}`;
  ctx.fillText(s.identity.displayName.slice(0, 26), 360, 196);
  ctx.fillStyle = "#48B9AB";
  ctx.font = `700 40px ${mono}`;
  ctx.fillText(lines.tier, 360, 256);
  ctx.fillStyle = "#DFEBEB";
  ctx.font = `400 28px ${mono}`;
  ctx.fillText(lines.born, 360, 310);
  lines.facts.slice(0, 3).forEach((f, i) => ctx.fillText(f.slice(0, 48), 360, 360 + i * 40));
  ctx.fillStyle = "#8A9B9B";
  ctx.font = `400 22px ${mono}`;
  ctx.fillText(lines.route.slice(0, 80), 64, 520);
  ctx.fillText(lines.link.slice(0, 90), 64, 560);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}
