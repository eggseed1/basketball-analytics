export type D1Result<T> = { results?: T[] };
export type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};
export type D1Database = { prepare(sql: string): D1Statement };

export type KvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export type WorkersAi = { run(model: string, input: Record<string, unknown>): Promise<unknown> };

export type AskAgentEnv = {
  AI?: WorkersAi;
  ASK_DB?: D1Database;
  PAGE_CACHE?: KvNamespace;
};

export function askAgentEnv(): AskAgentEnv {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: AskAgentEnv };
    };
    return getCloudflareContext()?.env ?? {};
  } catch {
    return {};
  }
}

/** On in local dev; in production only when the ASK_AGENT var is "1". */
export function askAgentEnabled(): boolean {
  return process.env.NODE_ENV === "development" || process.env.ASK_AGENT === "1";
}
