/**
 * Diagnostic BDL → canonical (ESPN) player identity for advanced-stats audit.
 *
 * NAME MATCH ≠ IDENTITY MATCH.
 * OpenAPI NBAPlayer has no ESPN id / NBA person id - only BDL numeric id.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export type BdlIdentityFixtureMapping = {
  bdlPlayerId: string;
  /** ESPN / site athlete id when known; null = deliberately unresolved. */
  canonicalPlayerId: string | null;
  playerName: string;
  role: "current_star" | "historical" | "common_name" | "unresolved";
  notes?: string;
};

export type BdlIdentityFixtureFile = {
  version: string;
  notes: string[];
  mappings: BdlIdentityFixtureMapping[];
};

export type BdlIdentityResolution =
  | {
      status: "resolved";
      bdlPlayerId: string;
      canonicalPlayerId: string;
      match: "fixture" | "alias";
      playerName?: string;
    }
  | {
      status: "unresolved";
      bdlPlayerId: string;
      reason: string;
    }
  | {
      status: "ambiguous";
      bdlPlayerId?: string;
      playerName: string;
      candidates: BdlIdentityFixtureMapping[];
      reason: string;
    };

const FIXTURE_RELATIVE = path.join(
  "data",
  "impact",
  "bdl-player-identity-fixture.json"
);

export async function loadBdlIdentityFixture(
  filePath = path.join(process.cwd(), FIXTURE_RELATIVE)
): Promise<BdlIdentityFixtureFile> {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as BdlIdentityFixtureFile;
}

export function buildBdlIdentityIndex(
  fixture: BdlIdentityFixtureFile
): Map<string, BdlIdentityFixtureMapping> {
  const byBdl = new Map<string, BdlIdentityFixtureMapping>();
  for (const row of fixture.mappings) {
    const id = String(row.bdlPlayerId).trim();
    if (!id) continue;
    if (byBdl.has(id)) {
      throw new Error(`Duplicate bdlPlayerId in identity fixture: ${id}`);
    }
    byBdl.set(id, row);
  }
  return byBdl;
}

/**
 * Resolve BDL player id → canonical ESPN id via fixture (and optional alias map).
 * Never uses name matching.
 */
export function resolveBdlPlayerIdentity(
  bdlPlayerId: string | number,
  index: Map<string, BdlIdentityFixtureMapping>,
  options?: {
    /** Optional ESPN↔NBA aliases; BDL join still requires fixture unless extended. */
    espnByNbaId?: Map<string, string>;
  }
): BdlIdentityResolution {
  const id = String(bdlPlayerId).trim();
  if (!id) {
    return {
      status: "unresolved",
      bdlPlayerId: id,
      reason: "Empty BDL player id.",
    };
  }

  const row = index.get(id);
  if (!row) {
    return {
      status: "unresolved",
      bdlPlayerId: id,
      reason:
        "No deterministic fixture/alias mapping for this BDL id. OpenAPI NBAPlayer exposes only BDL id (no ESPN/NBA person id).",
    };
  }

  if (row.canonicalPlayerId == null || row.canonicalPlayerId === "") {
    return {
      status: "unresolved",
      bdlPlayerId: id,
      reason:
        row.notes ??
        "Fixture marks this BDL id as deliberately unresolved (no canonical ESPN id).",
    };
  }

  // Alias map is NBA↔ESPN; unused for BDL unless caller already mapped BDL→NBA.
  void options;

  return {
    status: "resolved",
    bdlPlayerId: id,
    canonicalPlayerId: row.canonicalPlayerId,
    match: "fixture",
    playerName: row.playerName,
  };
}

/**
 * Name lookup is diagnostic only - returns ambiguous when multiple share a name.
 * Never silently picks a canonical id.
 */
export function resolveBdlIdentityByName(
  playerName: string,
  fixture: BdlIdentityFixtureFile
): BdlIdentityResolution {
  const needle = playerName.trim().toLowerCase();
  const candidates = fixture.mappings.filter(
    (m) => m.playerName.trim().toLowerCase() === needle
  );
  if (candidates.length === 0) {
    return {
      status: "unresolved",
      bdlPlayerId: "",
      reason: "No fixture rows for this name; name matching is not a production key.",
    };
  }
  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      playerName,
      candidates,
      reason:
        "Multiple fixture rows share this display name - refusing silent resolution.",
    };
  }
  const only = candidates[0]!;
  if (only.canonicalPlayerId == null) {
    return {
      status: "unresolved",
      bdlPlayerId: only.bdlPlayerId,
      reason: "Sole name match is deliberately unresolved.",
    };
  }
  // Even a unique name match is not admitted as production identity.
  return {
    status: "ambiguous",
    bdlPlayerId: only.bdlPlayerId,
    playerName,
    candidates: [only],
    reason:
      "Unique name match is still not a production identity key (NAME MATCH ≠ IDENTITY MATCH).",
  };
}

export function summarizeIdentityCapability(fixture: BdlIdentityFixtureFile): {
  deterministicExternalIdsOnBdlPlayerPayload: string[];
  limitation: string;
  fixtureResolvedCount: number;
  fixtureUnresolvedCount: number;
} {
  return {
    deterministicExternalIdsOnBdlPlayerPayload: ["bdl.id (numeric)"],
    limitation:
      "BDL OpenAPI NBAPlayer has no espn_id / nba_person_id / external reference - only BDL id + bio fields. Production ESPN joins require an explicit mapping layer (fixture/alias), not payload fields.",
    fixtureResolvedCount: fixture.mappings.filter((m) => m.canonicalPlayerId)
      .length,
    fixtureUnresolvedCount: fixture.mappings.filter((m) => !m.canonicalPlayerId)
      .length,
  };
}
