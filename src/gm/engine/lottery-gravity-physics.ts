/**
 * Gravity-led, fair, deterministic lottery mixer (physics version 2).
 *
 * The extraction is the FIRST identical numbered ball that fits through
 * the opening at six o'clock. Gravity points down. Periodic tangential
 * paddles and weak air turbulence keep the ball bed moving; no magic
 * winner selection, per-team forces, or vertical suction are used.
 *
 * A uniformly shuffled assignment of ball IDs to otherwise identical
 * physical particles keeps the underlying extraction distribution fair.
 * Saved version 1 scenes continue using lottery-hole-physics.ts unchanged.
 */
import { createRng } from "./rng";
import type { HoleBall, HoleExit, HoleParticle, HoleScene } from "./lottery-hole-physics";

export const LOTTERY_GRAVITY = {
  size: 304,
  center: 152,
  radius: 134,
  ballRadius: 9,
  gapWidth: 27,
  openFrame: 150,
  maxFrames: 2400,
} as const;

export function createLotteryGravityScene(balls: readonly HoleBall[], seed: number): HoleScene {
  if (balls.length === 0 || new Set(balls.map(b => b.id)).size !== balls.length) {
    throw new Error("Gravity chamber needs at least one uniquely numbered ball");
  }
  const { center: c, radius: wall, ballRadius: r, gapWidth, openFrame } = LOTTERY_GRAVITY;
  const labels = createRng((seed ^ 0x3c6ef372) >>> 0);
  const random = createRng((seed ^ 0x9e3779b9) >>> 0);
  const assigned = [...balls];
  for (let i = assigned.length - 1; i > 0; i--) {
    const j = Math.floor(labels() * (i + 1));
    [assigned[i], assigned[j]] = [assigned[j]!, assigned[i]!];
  }

  // Spatially separated positions, shuffled independently from ball IDs.
  const particles: HoleParticle[] = [];
  for (const ball of assigned) {
    let x: number = c, y: number = c;
    for (let trial = 0; trial < 90; trial++) {
      const theta = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * (wall - r - 3);
      const candidateX = c + Math.cos(theta) * distance;
      const candidateY = c + Math.sin(theta) * distance;
      x = candidateX; y = candidateY;
      if (!particles.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < (2 * r + 0.6) ** 2)) break;
    }
    particles.push({
      ...ball, x, y,
      vx: (random() - 0.5) * 2.6,
      vy: (random() - 0.5) * 2.2,
    });
  }
  let frame = 0;
  let collisions = 0;
  let wallHits = 0;
  let exit: HoleExit | undefined;
  const step = () => {
    if (exit) return exit;
    frame++;
    const inner = wall - r;
    for (const ball of particles) {
      const dx = ball.x - c;
      const dy = ball.y - c;
      // Gentle alternating mixer paddles, gravity, and minor pressure noise.
      // Unlike v1 there is NO upward force or top-outlet suction.
      const paddle = (frame % 270 < 135 ? 1 : -1) * 0.0009;
      ball.vx += -dy * paddle + (random() - 0.5) * 0.12;
      ball.vy += dx * paddle + 0.082 + (random() - 0.5) * 0.12;
      // When balls gather near the bottom edge, the paddles stir them
      // sideways rather than levitating the entire chamber.
      if (ball.y > c + 55) {
        ball.vx += (frame % 270 < 135 ? 1 : -1) * 0.065;
      }
      ball.vx *= 0.993;
      ball.vy *= 0.993;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > 3.8) {
        ball.vx *= 3.8 / speed;
        ball.vy *= 3.8 / speed;
      }
      ball.x += ball.vx;
      ball.y += ball.vy;
      const dist = Math.hypot(ball.x - c, ball.y - c);
      if (dist <= inner) continue;
      // Opening at the bottom. Ball centers must fit inside a true
      // ball-sized throat; no "nearest ball" or predetermined extraction.
      if (frame >= openFrame && ball.y > c + wall * 0.72 &&
          Math.abs(ball.x - c) < (gapWidth / 2 - r + 1)) {
        exit = { ballId: ball.id, frame, collisions, wallHits };
        return exit;
      }
      const nx = (ball.x - c) / dist;
      const ny = (ball.y - c) / dist;
      ball.x = c + nx * inner;
      ball.y = c + ny * inner;
      const impact = ball.vx * nx + ball.vy * ny;
      if (impact > 0) {
        ball.vx -= 1.82 * impact * nx;
        ball.vy -= 1.82 * impact * ny;
      }
      wallHits++;
    }
    // Normal impulses for identical masses; team and ball labels irrelevant.
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i]!, b = particles[j]!;
        let dx = b.x - a.x, dy = b.y - a.y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= (2 * r) ** 2) continue;
        if (distanceSquared < 0.000001) {
          const theta = random() * 2 * Math.PI;
          dx = Math.cos(theta) * 0.001;
          dy = Math.sin(theta) * 0.001;
          distanceSquared = dx * dx + dy * dy;
        }
        const distance = Math.sqrt(distanceSquared);
        const nx = dx / distance, ny = dy / distance;
        const overlap = (2 * r - distance) * 0.5;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (relative < 0) {
          const impulse = -(1 + 0.82) * relative * 0.5;
          a.vx -= impulse * nx; a.vy -= impulse * ny;
          b.vx += impulse * nx; b.vy += impulse * ny;
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

export function simulateLotteryGravityExit(balls: readonly HoleBall[], seed: number): HoleExit {
  const scene = createLotteryGravityScene(balls, seed);
  for (let i = 0; i < LOTTERY_GRAVITY.maxFrames; i++) {
    const result = scene.step();
    if (result) return result;
  }
  // Do not fabricate an exit. Try a fresh unbiased seed in the caller.
  throw new Error("Gravity lottery chamber failed to eject a ball within the safety limit");
}
