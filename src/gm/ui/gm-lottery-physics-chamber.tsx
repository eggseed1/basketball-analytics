"use client";

import { useEffect, useRef } from "react";

type PhysicalBall = { id: number; teamId: string };
type Particle = PhysicalBall & { x: number; y: number; vx: number; vy: number; radius: number };
const colorFor = (team: string) => {
  let hash = 0;
  for (let i = 0; i < team.length; i++) hash = (Math.imul(hash, 31) + team.charCodeAt(i)) | 0;
  return "hsl(" + (Math.abs(hash) % 360) + " 76% 65%)";
};

/** Canvas chamber with per-ball impulse, airflow, wall and ball/ball collisions.
 * This animates the *persisted* uniformly sampled urn, never selects a winner
 * from display pixels, which would introduce frame-rate and physics bias. */
export function LotteryPhysicsChamber({
  balls, selectedTeams, removedBallIds = [], pullingId, spinning,
}: {
  balls: PhysicalBall[];
  selectedTeams: string[];
  removedBallIds?: number[];
  pullingId?: number;
  spinning: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const spinningRef = useRef(spinning);
  const selectedRef = useRef(new Set(selectedTeams));
  const pullingRef = useRef(pullingId);
  const removedBallRef = useRef(new Set(removedBallIds));
  spinningRef.current = spinning;
  selectedRef.current = new Set(selectedTeams);
  pullingRef.current = pullingId;
  removedBallRef.current = new Set(removedBallIds);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let animation = 0;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = 362, h = 226;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const radius = balls.length > 20 ? 9.6 : 14;
    const randomUnit = (id: number, scale: number) => {
      const number = Math.sin(id * 127.1 + scale * 311.7) * 43758.5453;
      return number - Math.floor(number);
    };
    particles.current = balls.map((ball, i) => ({
      ...ball,
      x: 36 + (i % 10) * 30 + (randomUnit(ball.id, 1) - 0.5) * 10,
      y: 35 + Math.floor(i / 10) * 39 + randomUnit(ball.id, 2) * 13,
      vx: (randomUnit(ball.id, 3) - 0.5) * 3,
      vy: (randomUnit(ball.id, 4) - 0.5) * 3,
      radius,
    }));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paint = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(9,19,39,.75)";
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, 174, 106, 0, 0, Math.PI * 2);
      ctx.fill();
      const available = particles.current.filter(p =>
        !selectedRef.current.has(p.teamId) && !removedBallRef.current.has(p.id) && p.id !== pullingRef.current);
      if (spinningRef.current && !reduced) {
        for (const ball of available) {
          // Tangential air currents plus upward jets, small deterministic
          // turbulence and gravity. Approximate fluidization, not a PRNG roll.
          const dx = ball.x - w / 2, dy = ball.y - h / 2;
          ball.vx += -dy * 0.00036 + Math.sin(frame * 0.075 + ball.id * 4.7) * 0.22;
          ball.vy += dx * 0.00028 - 0.15 + Math.cos(frame * 0.085 + ball.id * 3.9) * 0.17 + 0.08;
          ball.vx *= 0.987; ball.vy *= 0.987;
          ball.x += Math.max(-5, Math.min(5, ball.vx));
          ball.y += Math.max(-5, Math.min(5, ball.vy));
          const nx = (ball.x - w / 2) / (174 - ball.radius);
          const ny = (ball.y - h / 2) / (106 - ball.radius);
          const magnitude = nx * nx + ny * ny;
          if (magnitude > 1) {
            const k = 1 / Math.sqrt(magnitude);
            ball.x = w / 2 + nx * k * (174 - ball.radius);
            ball.y = h / 2 + ny * k * (106 - ball.radius);
            const nLength = Math.hypot(nx / 174, ny / 106) || 1;
            const normalX = (nx / 174) / nLength;
            const normalY = (ny / 106) / nLength;
            const impact = ball.vx * normalX + ball.vy * normalY;
            if (impact > 0) {
              ball.vx -= 1.85 * impact * normalX;
              ball.vy -= 1.85 * impact * normalY;
            }
          }
        }
        // Resolve colliding pairs, conserving approximately equal mass and
        // restitution. 37 balls => at most 666 inexpensive pair checks/frame.
        for (let i = 0; i < available.length; i++) {
          for (let j = i + 1; j < available.length; j++) {
            const a = available[i]!, b = available[j]!;
            const dx = b.x - a.x, dy = b.y - a.y;
            const distance = Math.hypot(dx, dy) || 0.001;
            const minDistance = a.radius + b.radius;
            if (distance >= minDistance) continue;
            const nx = dx / distance, ny = dy / distance, overlap = minDistance - distance;
            a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
            const speed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (speed < 0) {
              const impulse = -(1 + 0.83) * speed / 2;
              a.vx -= impulse * nx; a.vy -= impulse * ny;
              b.vx += impulse * nx; b.vy += impulse * ny;
            }
          }
        }
      }
      for (const ball of available) {
        const shade = ctx.createRadialGradient(ball.x - ball.radius * 0.4, ball.y - ball.radius * 0.5,
          1, ball.x, ball.y, ball.radius);
        shade.addColorStop(0, "#fff");
        shade.addColorStop(0.37, colorFor(ball.teamId || "neutral"));
        shade.addColorStop(1, "#475569");
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.68)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.font = "bold " + (radius < 11 ? 8 : 11) + "px ui-sans-serif,system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#0f172a";
        ctx.fillText(String(ball.id), ball.x, ball.y + 1);
      }
      ctx.strokeStyle = "rgba(226,232,240,.53)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, 174, 106, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(148,163,184,.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(w / 2 - 3, h / 2 - 5, 158, 93, 0, 3.3, 6);
      ctx.stroke();
      animation = window.requestAnimationFrame(paint);
    };
    paint();
    return () => window.cancelAnimationFrame(animation);
  }, [balls]);

  return <div className="relative mx-auto w-full max-w-[370px]">
    <div className="absolute left-1/2 top-0 z-10 h-10 w-11 -translate-x-1/2 rounded-b-lg border-x-[3px] border-b-[3px] border-cyan-200/80 bg-cyan-200/10 shadow-[0_0_22px_rgba(125,211,252,.25)]" aria-hidden="true" />
    <canvas ref={canvasRef} width={362} height={226} className="w-full" aria-hidden="true" />
    <div aria-hidden="true" className="mx-auto -mt-3 h-5 w-28 rounded-t-full border-t-4 border-slate-400 bg-slate-950"/>
    <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[.16em] text-slate-300">
      {spinning ? "Air jets active · collisions simulated" : "Physical ball chamber"}
    </p>
  </div>;
}
