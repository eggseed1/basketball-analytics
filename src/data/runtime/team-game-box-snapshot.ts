/**
 * Per-game team box totals built by scripts/build-team-game-box-snapshot.ts.
 * Lives under public/runtime (ASSETS) so the ~572KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 */
import {
  teamGameBoxFromRow,
  type TeamGameBox,
  type TeamGameBoxRow,
  type TeamGameBoxSnapshot,
} from "@/lib/team-game-box";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/team-game-box-snapshot.json";

let data: TeamGameBoxSnapshot | null | undefined;

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ASSETS?: AssetsFetcher } };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function loadFromPublicDir(): TeamGameBoxSnapshot | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "team-game-box-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as TeamGameBoxSnapshot;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<TeamGameBoxSnapshot | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as TeamGameBoxSnapshot;
  } catch {
    return null;
  }
}

export async function ensureTeamGameBox(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  data = fromDisk ?? (await loadFromAssets());
  return data != null;
}

export function teamGameBoxSeasons(): string[] {
  return Object.keys(data?.teams ?? {});
}

/** ET date → totals for one team-season. Empty when the season has no archive. */
export function teamGameBoxesByDate(
  espnTeamId: string,
  season: string
): Map<string, TeamGameBox> {
  const rows: TeamGameBoxRow[] = data?.teams?.[season]?.[espnTeamId] ?? [];
  return new Map(rows.map((row) => [row[0], teamGameBoxFromRow(row)] as const));
}
