/**
 * Deploy-baked owners, executives, head coach, arena and G League affiliate.
 * Written nightly by scripts/build-team-leadership.ts from team Wikipedia infoboxes.
 * Lives under public/runtime (ASSETS) so the ~38KB JSON stays off the Worker.
 */

export type LeadershipPerson = { name: string; note?: string; wiki?: string };

export type TeamLeadership = {
  teamId: string;
  abbr: string;
  displayName: string;
  /** Last date this team's infobox was read successfully. */
  checkedAt?: string;
  owners: LeadershipPerson[];
  ceo: LeadershipPerson[];
  president: LeadershipPerson[];
  generalManager: LeadershipPerson[];
  headCoach: { name: string; espnExperienceYears: number | null; wiki?: string } | null;
  affiliate: LeadershipPerson | null;
  arena: { name: string; location: string | null; wiki?: string } | null;
  sources: { wikipedia: string | null; espn: string };
};

type LeadershipFile = { retrievedAt?: string; teams?: TeamLeadership[] };

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/team-leadership.json";

let data: LeadershipFile | null | undefined;

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

function loadFromPublicDir(): LeadershipFile | null {
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
      "team-leadership.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as LeadershipFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<LeadershipFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as LeadershipFile;
  } catch {
    return null;
  }
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) data = file;
}

export async function ensureTeamLeadership(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    data = fromDisk;
    return true;
  }
  data = await loadFromAssets();
  return data != null;
}

export function teamLeadershipRetrievedAt(): string | null {
  tryPrimeFromDisk();
  return data?.retrievedAt ?? null;
}

export function getTeamLeadership(teamId: string): TeamLeadership | null {
  tryPrimeFromDisk();
  return data?.teams?.find((t) => t.teamId === teamId) ?? null;
}
