import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LebronRating } from "@/data/types";
import { SAMPLE_LEBRON_RATINGS } from "./sample-lebron";

const CSV_RELATIVE = path.join("data", "impact", "lebron.csv");

/**
 * Load LEBRON ratings from `data/impact/lebron.csv` when present; otherwise
 * fall back to the in-repo seed snapshot.
 */
export async function loadLebronRatings(
  season?: string
): Promise<LebronRating[]> {
  const fromCsv = await tryLoadCsv();
  const rows = fromCsv ?? SAMPLE_LEBRON_RATINGS;
  if (!season) return [...rows];
  return rows.filter((row) => row.season === season);
}

async function tryLoadCsv(): Promise<LebronRating[] | null> {
  const filePath = path.join(process.cwd(), CSV_RELATIVE);
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const required = ["player_name", "season", "lebron"] as const;
  for (const key of required) {
    if (idx(key) < 0) {
      throw new Error(
        `LEBRON CSV missing column "${key}". Expected headers: player_name,season,lebron,o_lebron,d_lebron,wins_added,team,player_id`
      );
    }
  }

  const rows: LebronRating[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const playerName = cols[idx("player_name")] ?? "";
    const season = cols[idx("season")] ?? "";
    const impact = Number(cols[idx("lebron")]);
    if (!playerName || !season || !Number.isFinite(impact)) continue;

    const playerIdCol = idx("player_id");
    const playerId =
      playerIdCol >= 0 && cols[playerIdCol]
        ? cols[playerIdCol]
        : slugId(playerName);

    rows.push({
      playerId,
      nbaPlayerId: playerIdCol >= 0 ? cols[playerIdCol] : undefined,
      playerName,
      season,
      source: "lebron",
      impact,
      offensive: optionalNumber(cols, idx("o_lebron")),
      defensive: optionalNumber(cols, idx("d_lebron")),
      winsAdded: optionalNumber(cols, idx("wins_added")),
      teamName: optionalString(cols, idx("team")),
      teamAbbr: optionalString(cols, idx("team_abbr")),
    });
  }

  return rows.sort((a, b) => b.impact - a.impact);
}

function optionalNumber(cols: string[], index: number): number | undefined {
  if (index < 0) return undefined;
  const n = Number(cols[index]);
  return Number.isFinite(n) ? n : undefined;
}

function optionalString(cols: string[], index: number): string | undefined {
  if (index < 0) return undefined;
  const value = cols[index]?.trim();
  return value || undefined;
}

function slugId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}
