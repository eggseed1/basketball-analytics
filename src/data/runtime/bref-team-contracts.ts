/**
 * Basketball-Reference team payroll pages for Cloudflare.
 * Lives under public/runtime (ASSETS) so the ~156KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 */
export type BrefSalaryCell = {
  amount: number;
  option?: "player" | "team";
  notGuaranteed?: true;
} | null;

export type BrefContractRow = {
  name: string;
  brefId: string;
  age?: number;
  years: BrefSalaryCell[];
  guaranteed: number | null;
};

export type BrefDraftRight = {
  name: string;
  brefId: string;
  age: number | null;
  draftYear: number | null;
  draftTeam: string | null;
  round: number | null;
  pick: number | null;
  club: string | null;
  league: string | null;
  country: string | null;
};

export type BrefTeamContracts = {
  code: string;
  retrievedAt: string;
  capSeason?: string;
  salaryCap?: number;
  largestGuarantee?: { name: string; brefId: string | null; amount: number };
  seasons: string[];
  rows: BrefContractRow[];
  totals: { years: Array<number | null>; guaranteed: number | null } | null;
  notes: Record<string, string>;
  draftRights: BrefDraftRight[];
};

type SnapshotFile = { generatedAt?: string; teams?: Record<string, BrefTeamContracts> };

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/bref-team-contracts-snapshot.json";

let data: SnapshotFile | null | undefined;

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

function loadFromPublicDir(): SnapshotFile | null {
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
      "bref-team-contracts-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SnapshotFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<SnapshotFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as SnapshotFile;
  } catch {
    return null;
  }
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) data = file;
}

export async function ensureBrefTeamContracts(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    data = fromDisk;
    return true;
  }
  data = await loadFromAssets();
  return data != null;
}

export function bundledContractTeamIds(): string[] {
  tryPrimeFromDisk();
  return Object.keys(data?.teams ?? {});
}

export function bundledTeamContracts(teamId: string): BrefTeamContracts | null {
  tryPrimeFromDisk();
  const team = data?.teams?.[teamId];
  if (!team?.seasons?.length) return null;
  return {
    ...team,
    rows: team.rows.filter((r) => r.brefId),
    draftRights: (team.draftRights ?? []).filter((r) => r.brefId),
  };
}
