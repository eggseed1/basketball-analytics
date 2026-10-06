/**
 * Pause briefly so the route's loading.tsx shell reaches the browser before
 * CPU-bound rendering starts. On Workers a response only flushes while the
 * isolate is idle, and these routes do about a second of synchronous work, so
 * without a pause the skeleton and the page arrive together. Next hands HTML
 * through several setImmediate hops before it is written, so step through a
 * few of those first, then wait on a real timer so the write can go out.
 * Call it first in both the page and generateMetadata, which share the heavy
 * loaders.
 */
const STREAM_YIELD_HOPS = 12;
const STREAM_YIELD_MS = 20;

function nextTask(): Promise<void> {
  return new Promise((resolve) =>
    typeof setImmediate === "function" ? setImmediate(resolve) : setTimeout(resolve, 0)
  );
}

export async function yieldForStreaming(): Promise<void> {
  for (let i = 0; i < STREAM_YIELD_HOPS; i++) await nextTask();
  await new Promise((resolve) => setTimeout(resolve, STREAM_YIELD_MS));
}
