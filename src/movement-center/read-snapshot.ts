import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { MovementCuratedSnapshot } from "@/movement-center/types";

const ROOT = () => path.join(process.cwd(), "data", "movement-center", "v1");

export function readMovementSnapshotSync(): MovementCuratedSnapshot | null {
  const p = path.join(ROOT(), "snapshot.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as MovementCuratedSnapshot;
  } catch {
    return null;
  }
}
