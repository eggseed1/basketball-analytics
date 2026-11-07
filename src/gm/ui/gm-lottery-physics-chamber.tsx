"use client";

import { useEffect, useRef } from "react";
import {
  createLotteryHoleScene, LOTTERY_HOLE, type HoleParticle,
} from "@/gm/engine/lottery-hole-physics";
import {
  createLotteryGravityScene, LOTTERY_GRAVITY,
} from "@/gm/engine/lottery-gravity-physics";

type PhysicalBall = { id: number; teamId: string };
const colorFor = (team: string) => {
  let hash = 0;
  for (let i = 0; i < team.length; i++) hash = (Math.imul(hash, 31) + team.charCodeAt(i)) | 0;
  return "hsl(" + (Math.abs(hash) % 360) + " 76% 65%)";
};

/**
 * Replays the exact deterministic physical extraction stored in the save.
 * V1 scenes are vertically mirrored visually, leaving their saved outcomes
 * untouched while presenting downward motion and the exit on the bottom.
 * V2 uses gravity toward a genuine bottom opening.
 *
 * A fixed simulation-tick budget per real second makes motion readable and
 * consistent on 30Hz, 60Hz and 120Hz displays. No more forced double-speed
 * after the fifth pick. Reduced-motion users see the same correct result.
 */
export function LotteryPhysicsChamber({
  balls, selectedTeams, removedBallIds = [], pullingId, spinning,
  sceneSeed, physicsVersion = 1, onExit, playbackSpeed = "cinematic",
}: {
  balls: PhysicalBall[];
  selectedTeams: string[];
  removedBallIds?: number[];
  pullingId?: number;
  spinning: boolean;
  sceneSeed?: number;
  physicsVersion?: 1 | 2;
  onExit?: (id: number) => void;
  playbackSpeed?: "cinematic" | "quick";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spinningRef = useRef(spinning);
  const pullingRef = useRef(pullingId);
  const onExitRef = useRef(onExit);
  const playbackRef = useRef(playbackSpeed);
  useEffect(() => {
    spinningRef.current = spinning;
    pullingRef.current = pullingId;
    onExitRef.current = onExit;
    playbackRef.current = playbackSpeed;
  }, [spinning, pullingId, onExit, playbackSpeed]);

  const selectedKey = [...selectedTeams].sort().join(",");
  const removedKey = [...removedBallIds].sort((a,b) => a-b).join(",");
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const settings = physicsVersion === 2 ? LOTTERY_GRAVITY : LOTTERY_HOLE;
    const { size, center: c, radius, ballRadius: r, gapWidth, openFrame } = settings;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    canvas.style.aspectRatio = String(size) + " / " + String(size);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const removed = new Set(removedBallIds);
    const selected = new Set(selectedTeams);
    const available = balls.filter(b => !selected.has(b.teamId) && !removed.has(b.id));
    const scene = sceneSeed === undefined || !available.length ? undefined :
      physicsVersion === 2
        ? createLotteryGravityScene(available, sceneSeed)
        : createLotteryHoleScene(available, sceneSeed);

    // Historical unsaved draws are illustrative, never a second lottery.
    const legacy: HoleParticle[] = available.map((ball, i) => {
      const theta = i * 2.399963;
      const rho = 16 + Math.sqrt((i + 0.5) / Math.max(1, available.length)) * (radius * 0.68);
      return {
        ...ball, x: c + rho * Math.cos(theta), y: c + rho * Math.sin(theta),
        vx: Math.sin(i * 17) * 0.9, vy: Math.cos(i * 11) * 0.9,
      };
    });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mirrorV1 = physicsVersion === 1 && Boolean(scene);
    const drawY = (y: number) => mirrorV1 ? size - y : y;
    let legacyFrame = 0;
    let request = 0;
    let notified = false;
    let lastTime = 0;
    let accumulator = 0;
    const paint = (time: number) => {
      const delta = lastTime ? Math.min(time - lastTime, 100) : 0;
      lastTime = time;
      if (spinningRef.current) {
        if (scene && !notified) {
          if (reduced) {
            for (let i = 0; i < settings.maxFrames; i++) {
              const exit = scene.step();
              if (exit) {
                notified = true;
                onExitRef.current?.(exit.ballId);
                break;
              }
            }
          } else {
            // Cinematic defaults to 24 physical steps/second. Quick is an
            // explicit user choice (48); browser FPS cannot speed it up.
            const msPerTick = 1000 / (playbackRef.current === "quick" ? 48 : 24);
            accumulator += delta;
            let budget = Math.min(6, Math.floor(accumulator / msPerTick));
            accumulator -= budget * msPerTick;
            while (budget-- > 0) {
              const exit = scene.step();
              if (exit) {
                notified = true;
                onExitRef.current?.(exit.ballId);
                break;
              }
            }
          }
        } else if (!scene && !reduced) {
          legacyFrame++;
          for (const p of legacy) {
            p.vx += Math.sin(legacyFrame * 0.07 + p.id) * 0.07;
            p.vy += 0.055 + Math.cos(legacyFrame * 0.08 + p.id) * 0.06;
            p.vx *= 0.989; p.vy *= 0.989;
            p.x += p.vx; p.y += p.vy;
            const dx = p.x - c, dy = p.y - c, dist = Math.hypot(dx, dy);
            if (dist > radius-r) {
              const nx = dx / dist, ny = dy / dist;
              p.x = c + nx * (radius-r); p.y = c + ny * (radius-r);
              const v = p.vx * nx + p.vy * ny;
              if (v > 0) { p.vx -= 1.8*v*nx; p.vy -= 1.8*v*ny; }
            }
          }
        }
      } else {
        // Don't catch up hundreds of physics frames when the draw resumes.
        accumulator = 0;
      }

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#0b1629";
      ctx.beginPath();
      ctx.arc(c,c,radius,0,Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = "rgba(125,211,252,.13)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(c,c,radius-7,0,Math.PI*2);
      ctx.stroke();

      // Same physical outlet in the lower rim for both versions. Archived V1
      // simulations are ONLY mirrored for display, never recalculated.
      const gapHalfAngle = Math.asin((gapWidth/2)/radius);
      ctx.strokeStyle = "rgba(226,232,240,.92)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(c,c,radius,Math.PI/2+gapHalfAngle,
        Math.PI/2 + Math.PI*2 - gapHalfAngle);
      ctx.stroke();
      const gateOpen = Boolean(scene && scene.frame >= openFrame);
      if (!gateOpen) {
        ctx.strokeStyle = "#fbbf24";
        ctx.beginPath();
        ctx.arc(c,c,radius,Math.PI/2-gapHalfAngle,Math.PI/2+gapHalfAngle);
        ctx.stroke();
      }
      ctx.strokeStyle = gateOpen ? "#67e8f9" : "#94a3b8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c-gapWidth/2,size-13); ctx.lineTo(c-gapWidth/2,size-1);
      ctx.moveTo(c+gapWidth/2,size-13); ctx.lineTo(c+gapWidth/2,size-1);
      ctx.stroke();

      for (const ball of scene?.particles ?? legacy) {
        if (ball.id === pullingRef.current || scene?.exit?.ballId === ball.id) continue;
        const y = drawY(ball.y);
        const shine = ctx.createRadialGradient(ball.x-r*0.4,y-r*0.5,1,ball.x,y,r);
        shine.addColorStop(0,"#fff");
        shine.addColorStop(0.35,colorFor(ball.teamId || "neutral"));
        shine.addColorStop(1,"#475569");
        ctx.fillStyle = shine;
        ctx.beginPath(); ctx.arc(ball.x,y,r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.75)";
        ctx.lineWidth = .6; ctx.stroke();
        ctx.font = "bold " + (size >= 300 ? "8" : "7") + "px ui-sans-serif,system-ui";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#101827";
        ctx.fillText(String(ball.id),ball.x,y+.5);
      }
      request = window.requestAnimationFrame(paint);
    };
    request = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(request);
    // selectedKey and removedKey fully capture chamber membership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balls, sceneSeed, physicsVersion, selectedKey, removedKey]);

  return <div className="relative mx-auto w-full max-w-[390px]">
    <canvas
      ref={canvasRef} width={physicsVersion === 2 ? 304 : 224}
      height={physicsVersion === 2 ? 304 : 224}
      className="block w-full" aria-hidden="true"
      data-testid="lottery-hole-chamber"
    />
    <div className="mx-auto -mt-1 h-4 w-28 rounded-b-full border-b-4 border-slate-400 bg-slate-950" aria-hidden="true" />
    <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[.12em] text-slate-300">
      {sceneSeed !== undefined
        ? spinning ? "Gravity · colliding balls · real exit" : "Saved physical draw"
        : "Historical lottery chamber"}
    </p>
  </div>;
}
