/**
 * Shared, deterministic NBA lottery chamber. The game engine and the canvas
 * run the same fixed-timestep simulation: a numbered ball wins ONLY when it
 * physically passes through the open top vent.
 *
 * All balls have identical radius, mass and forces. A fresh uniformly
 * shuffled association of ball IDs with physical particles on every attempt
 * makes each remaining ball exchangeable: no team, number, browser FPS or
 * renderer state changes its chance. With 37 physical balls the opening
 * odds remain exactly 1/37 per ball in the ideal uniform shuffle model.
 *
 * This is an intentionally lightweight 2-D approximation (air jets, wall
 * reflection, equal-mass impulses), not a claim of exact fluid dynamics.
 */
import { createRng } from "./rng";

export const LOTTERY_HOLE = {
  size: 224,
  center: 112,
  radius: 100,
  ballRadius: 8,
  gapWidth: 23,
  openFrame: 72,
  maxFrames: 2400,
} as const;

export type HoleBall = { id: number; teamId: string };
export type HoleParticle = HoleBall & {
  x: number; y: number; vx: number; vy: number;
};
export type HoleExit = { ballId: number; frame: number; collisions: number; wallHits: number };
export type HoleScene = {
  particles: HoleParticle[];
  step: () => HoleExit | undefined;
  readonly frame: number;
  readonly collisions: number;
  readonly exit: HoleExit | undefined;
};

export function createLotteryHoleScene(balls: readonly HoleBall[], seed: number): HoleScene {
  if (!balls.length || new Set(balls.map(b => b.id)).size !== balls.length) {
    throw new Error("Lottery chamber requires a nonempty set of unique ball IDs");
  }
  const { center: c, radius: outer, ballRadius: r, gapWidth, openFrame } = LOTTERY_HOLE;
  // These are two independent seeded streams. The physical geometry/air
  // currents NEVER depend on a ball's ID or on its owner.
  const labels = createRng((seed ^ 0x3c6ef372) >>> 0);
  const random = createRng((seed ^ 0x9e3779b9) >>> 0);
  const shuffled = [...balls];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(labels() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const particles: HoleParticle[] = [];
  for (const ball of shuffled) {
    let x = c, y = c;
    for (let attempt = 0; attempt < 32; attempt++) {
      const theta = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * (outer - r - 2);
      x = c + distance * Math.cos(theta);
      y = c + distance * Math.sin(theta);
      if (!particles.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < (r * 2.1) ** 2)) break;
    }
    particles.push({
      ...ball, x, y,
      vx: (random() - 0.5) * 3.5,
      vy: (random() - 0.5) * 3.5,
    });
  }
  let frame = 0;
  let collisions = 0;
  let wallHits = 0;
  let exit: HoleExit | undefined;
  const step = (): HoleExit | undefined => {
    if (exit) return exit;
    frame++;
    const inner = outer - r;
    for (const ball of particles) {
      const dx = ball.x - c, dy = ball.y - c;
      const swirl = (frame % 250 < 125 ? 1 : -1) * 0.001;
      ball.vx += -dy * swirl + (random() - 0.5) * 0.22;
      ball.vy += dx * swirl - 0.12 + (random() - 0.5) * 0.22;
      if (ball.y < c - 22) {
        // Air is drawn toward the ball-sized outlet near the top.
        ball.vx -= dx * 0.006;
        ball.vy -= 0.07;
      }
      ball.vx *= 0.995;
      ball.vy *= 0.995;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > 4.6) {
        ball.vx *= 4.6 / speed;
        ball.vy *= 4.6 / speed;
      }
      ball.x += ball.vx;
      ball.y += ball.vy;
      const length = Math.hypot(ball.x - c, ball.y - c);
      if (length <= inner) continue;
      // The gap opens only AFTER a visible mixing cycle. An escaping ball
      // actually crosses the circular wall; we never choose by index here.
      const fitsHole = frame >= openFrame && ball.y < c - 60 &&
        Math.abs(ball.x - c) < gapWidth / 2 - r + 1;
      if (fitsHole) {
        exit = { ballId: ball.id, frame, collisions, wallHits };
        return exit;
      }
      const nx = (ball.x - c) / length, ny = (ball.y - c) / length;
      ball.x = c + nx * inner;
      ball.y = c + ny * inner;
      const impact = ball.vx * nx + ball.vy * ny;
      if (impact > 0) {
        ball.vx -= 1.86 * impact * nx;
        ball.vy -= 1.86 * impact * ny;
      }
      wallHits++;
    }
    // Equal-mass elastic impulses and positional separation. Particle array
    // order is unrelated to ID, so each ball gets identical treatment.
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i]!, b = particles[j]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= (2 * r) ** 2) continue;
        const distance = Math.sqrt(distanceSquared) || 0.001;
        const nx = dx / distance, ny = dy / distance;
        const overlap = (2 * r - distance) * 0.5;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (approach < 0) {
          const impulse = -(1 + 0.83) * approach * 0.5;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;
        }
        collisions++;
      }
    }
    return undefined;
  };
  return {
    particles, step,
    get frame() { return frame; },
    get collisions() { return collisions; },
    get exit() { return exit; },
  };
}

export function simulateLotteryHoleExit(balls: readonly HoleBall[], seed: number): HoleExit {
  const scene = createLotteryHoleScene(balls, seed);
  for (let i = 0; i < LOTTERY_HOLE.maxFrames; i++) {
    const exited = scene.step();
    if (exited) return exited;
  }
  // Never substitute a random winner if an extreme seeded chamber stalls.
  // The caller can retry with another independent chamber seed instead.
  throw new Error("Lottery chamber failed to eject a ball within the safety limit");
}
