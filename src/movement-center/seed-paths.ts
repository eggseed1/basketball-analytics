import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const SEEDS_DIR = path.join(
  process.cwd(),
  "data",
  "movement-center",
  "seeds",
  "v1"
);

export const SNAPSHOT_PATH = path.join(
  process.cwd(),
  "data",
  "movement-center",
  "v1",
  "snapshot.json"
);

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function seedsExist(): boolean {
  return existsSync(path.join(SEEDS_DIR, "manifest.json"));
}
