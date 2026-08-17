/**
 * Classify provider/network failures for soft-fail catalogs (no secrets).
 */

export type ProviderFailureKind =
  | "http_403"
  | "http_429"
  | "http_5xx"
  | "http_4xx"
  | "timeout"
  | "network"
  | "malformed"
  | "empty"
  | "unknown";

export function classifyProviderFailure(error: unknown): {
  kind: ProviderFailureKind;
  label: string;
} {
  if (!(error instanceof Error)) {
    return { kind: "unknown", label: "unknown provider error" };
  }
  const msg = error.message || "";
  const statusMatch = /ESPN request failed \((\d+)\)/.exec(msg);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status === 403) return { kind: "http_403", label: "ESPN HTTP 403" };
    if (status === 429) return { kind: "http_429", label: "ESPN HTTP 429" };
    if (status >= 500) return { kind: "http_5xx", label: `ESPN HTTP ${status}` };
    if (status >= 400) return { kind: "http_4xx", label: `ESPN HTTP ${status}` };
  }
  if (
    /timed out|TimeoutError|AbortError/i.test(msg) ||
    error.name === "TimeoutError" ||
    error.name === "AbortError"
  ) {
    return { kind: "timeout", label: "timeout" };
  }
  if (/Failed to fetch|ECONNRESET|ENOTFOUND|network/i.test(msg)) {
    return { kind: "network", label: "network error" };
  }
  if (/JSON|Unexpected token|malformed/i.test(msg)) {
    return { kind: "malformed", label: "malformed response" };
  }
  return { kind: "unknown", label: msg.slice(0, 160) || "unknown provider error" };
}
