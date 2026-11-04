"use client";

import { useEffect, useRef } from "react";
import {
  createLotteryHoleScene, LOTTERY_HOLE, type HoleParticle,
} from "@/gm/engine/lottery-hole-physics";

type PhysicalBall = { id: number; teamId: string };
const colorFor = (team: string) => {
  let hash = 0;
  for (let i = 0; i < team.length; i++) hash = (Math.imul(hash, 31) + team.charCodeAt(i)) | 0;
  return "hsl(" + (Math.abs(hash) % 360) + " 76% 65%)";
};

/**
 * Physics and engine use exactly the same deterministic integrator and seed.
 * The hole is a real gap in the circular collision boundary. onExit fires
 * only when a ball physically leaves, NEVER on an arbitrary timer.
 * Older saves, and the pre-2027 14-ball lottery, retain illustrative motion
 * because their outcomes were fixed by another draw method.
 */
export function LotteryPhysicsChamber({
  balls, selectedTeams, removedBallIds = [], pullingId, spinning,
  sceneSeed, onExit, fast = false,
}: {
  balls: PhysicalBall[];
  selectedTeams: string[];
  removedBallIds?: number[];
  pullingId?: number;
  spinning: boolean;
  sceneSeed?: number;
  onExit?: (id: number) => void;
  fast?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spinningRef = useRef(spinning);
  const pullingRef = useRef(pullingId);
  const onExitRef = useRef(onExit);
  const fastRef = useRef(fast);
  useEffect(() => {
    spinningRef.current = spinning;
    pullingRef.current = pullingId;
    onExitRef.current = onExit;
    fastRef.current = fast;
  }, [spinning, pullingId, onExit, fast]);

  // Names/arrays can be new on each React render. Key by actual chamber
  // membership to avoid restarting physics when the parent rerenders.
  const selectedKey = [...selectedTeams].sort().join(",");
  const removedKey = [...removedBallIds].sort((a, b) => a - b).join(",");
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { size, center: c, radius, ballRadius, gapWidth, openFrame } = LOTTERY_HOLE;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const removed = new Set(removedBallIds);
    const selected = new Set(selectedTeams);
    const available = balls.filter(ball => !selected.has(ball.teamId) && !removed.has(ball.id));
    const physical = sceneSeed !== undefined;
    const scene = physical && available.length ? createLotteryHoleScene(available, sceneSeed) : undefined;
    // Classic/archived lottery: do not reinterpret its already-saved outcome.
    const legacy: HoleParticle[] = available.map((ball, i) => {
      const theta = i * 2.399963;
      const rho = 14 + Math.sqrt((i + 0.5) / Math.max(1, available.length)) * 71;
      return {
        ...ball, x: c + rho * Math.cos(theta), y: c + rho * Math.sin(theta),
        vx: Math.sin(i * 17) * 1.1, vy: Math.cos(i * 11) * 1.1,
      };
    });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let request = 0;
    let notified = false;
    const paint = () => {
      frame++;
      if (spinningRef.current) {
        if (scene && !notified) {
          // A reduced-motion user still receives the exact same exit, without
          // needing to watch the motion. Other users see real physics frames.
          const steps = reduced ? LOTTERY_HOLE.maxFrames : fastRef.current ? 2 : 1;
          for (let n = 0; n < steps; n++) {
            const exited = scene.step();
            if (exited) {
              notified = true;
              onExitRef.current?.(exited.ballId);
              break;
            }
          }
        } else if (!scene && !reduced) {
          for (const p of legacy) {
            p.vx += Math.sin(frame * 0.07 + p.id) * 0.09;
            p.vy += Math.cos(frame * 0.08 + p.id) * 0.08 - 0.04;
            p.vx *= 0.995;
            p.vy *= 0.995;
            p.x += p.vx; p.y += p.vy;
            const dx = p.x - c, dy = p.y - c, dist = Math.hypot(dx, dy);
            if (dist > radius - ballRadius) {
              const nx = dx / dist, ny = dy / dist;
              p.x = c + nx * (radius - ballRadius);
              p.y = c + ny * (radius - ballRadius);
              const v = p.vx * nx + p.vy * ny;
              if (v > 0) { p.vx -= 1.8 * v * nx; p.vy -= 1.8 * v * ny; }
            }
          }
        }
      }

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#091327";
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(125,211,252,.15)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(c, c, radius - 7, 0, Math.PI * 2);
      ctx.stroke();

      // The transparent, ball-width outlet is at twelve o'clock. It remains
      // sealed for the first 72 simulation ticks so the balls visibly mix.
      ctx.strokeStyle = "rgba(226,232,240,.82)";
      ctx.lineWidth = 4;
      const half = Math.asin((gapWidth / 2) / radius);
      ctx.beginPath();
      ctx.arc(c, c, radius, -Math.PI / 2 + half,
        -Math.PI / 2 + Math.PI * 2 - half);
      ctx.stroke();
      const gateOpen = Boolean(scene && scene.frame >= openFrame);
      if (!gateOpen) {
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(c, c, radius, -Math.PI / 2 - half, -Math.PI / 2 + half);
        ctx.stroke();
      }
      // Outflow funnel and a thin channel above the single open hole.
      ctx.strokeStyle = gateOpen ? "rgba(103,232,249,.96)" : "rgba(148,163,184,.65)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c - gapWidth / 2, 12);
      ctx.lineTo(c - gapWidth / 2, 1);
      ctx.moveTo(c + gapWidth / 2, 12);
      ctx.lineTo(c + gapWidth / 2, 1);
      ctx.stroke();

      const particles = scene?.particles ?? legacy;
      for (const ball of particles) {
        if (ball.id === pullingRef.current || scene?.exit?.ballId === ball.id) continue;
        const r = ballRadius;
        const shade = ctx.createRadialGradient(ball.x - r * 0.4, ball.y - r * 0.5, 1,
          ball.x, ball.y, r);
        shade.addColorStop(0, "#fff");
        shade.addColorStop(0.38, colorFor(ball.teamId || "neutral"));
        shade.addColorStop(1, "#475569");
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.7)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.font = "bold 7px ui-sans-serif,system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#101827";
        ctx.fillText(String(ball.id), ball.x, ball.y + 0.5);
      }
      request = window.requestAnimationFrame(paint);
    };
    request = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(request);
    // selectedKey/removedKey completely capture membership changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balls, sceneSeed, selectedKey, removedKey]);

  return <div className="relative mx-auto w-full max-w-[292px]">
    <canvas
      ref={canvasRef} width={224} height={224}
      className="w-full" aria-hidden="true"
      data-testid="lottery-hole-chamber"
    />
    <div className="mx-auto -mt-3 h-5 w-28 rounded-t-full border-t-4 border-slate-400 bg-slate-950" aria-hidden="true" />
    <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[.14em] text-slate-300">
      {sceneSeed !== undefined
        ? spinning ? "Physical airflow + collisions · ball-sized exit" : "Saved physics chamber"
        : "Illustrative historical chamber"}
    </p>
  </div>;
}
