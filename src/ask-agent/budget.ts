import type { KvNamespace } from "./env";

/**
 * Workers AI gives the account 10,000 free neurons a day, shared with the
 * nightly sentiment scripts. The agent stops at half of that, so testing
 * costs nothing and the worst case past the free tier is about $0.06 a day.
 */
export const DAILY_NEURON_CAP = 5000;

function dayKey(now = new Date()): string {
  return `ask-agent:neurons:${now.toISOString().slice(0, 10)}`;
}

export async function neuronsUsedToday(kv: KvNamespace | undefined): Promise<number> {
  if (!kv) return 0;
  const raw = await kv.get(dayKey());
  const used = raw == null ? 0 : Number(raw);
  return Number.isFinite(used) ? used : 0;
}

export async function recordNeurons(kv: KvNamespace | undefined, neurons: number): Promise<number> {
  if (!kv || !(neurons > 0)) return neuronsUsedToday(kv);
  const total = (await neuronsUsedToday(kv)) + neurons;
  await kv.put(dayKey(), String(Math.round(total * 100) / 100), { expirationTtl: 2 * 86400 });
  return total;
}
