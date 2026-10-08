/**
 * Serializable seeded streams (mulberry32). Each domain owns one uint32 state
 * so a draw in one domain never shifts another; the state lives inside the
 * saved life and survives JSON round trips.
 */

export type StreamName = "generation" | "growth" | "training" | "injury" | "events" | "games" | "scouting" | "draft" | "finance" | "intl";

export type Streams = Record<StreamName, number> & { peers: number[] };

/** Append new names at the end: a stream's seed depends on its position. */
export const STREAM_NAMES: StreamName[] = ["generation", "growth", "training", "injury", "events", "games", "scouting", "draft", "finance", "intl"];

/** Seed for one named stream, used when an older save lacks it. */
export function streamSeed(seed: number, name: StreamName): number {
  return mix((seed >>> 0) + Math.imul(STREAM_NAMES.indexOf(name) + 1, 0x9e3779b9));
}

export function hashString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return mix(h);
}

function mix(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export function createStreams(seed: number, peerCount = 4): Streams {
  const base = seed >>> 0;
  const s = {} as Streams;
  for (const name of STREAM_NAMES) s[name] = streamSeed(base, name);
  s.peers = Array.from({ length: peerCount }, (_, i) => mix(base ^ Math.imul(i + 101, 0x85ebca6b)));
  return s;
}

/** Advance a stream state and return a float in [0, 1). */
function step(state: number): [number, number] {
  const t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

/** A mutable view over one stream inside a Streams object. */
export class Rng {
  constructor(
    private readonly streams: Streams,
    private readonly name: StreamName | number,
  ) {}

  next(): number {
    if (typeof this.name === "number") {
      const [v, t] = step(this.streams.peers[this.name]!);
      this.streams.peers[this.name] = t;
      return v;
    }
    const [v, t] = step(this.streams[this.name]);
    this.streams[this.name] = t;
    return v;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  normal(mean = 0, sd = 1): number {
    const u = Math.max(1e-12, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += Math.max(0, weight(item));
    let r = this.next() * total;
    for (const item of items) {
      r -= Math.max(0, weight(item));
      if (r < 0) return item;
    }
    return items[items.length - 1]!;
  }
}

export const rngOf = (streams: Streams, name: StreamName | number) => new Rng(streams, name);

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const round1 = (n: number) => Math.round(n * 10) / 10;
