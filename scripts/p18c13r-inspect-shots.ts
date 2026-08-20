import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const dir = "data/drbl/history/drbl-history-v1/2005-06/games";
const f = readdirSync(dir).find((x) => x.endsWith(".json"))!;
const g = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as {
  summary?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
};
console.log("keys", Object.keys(g));
console.log("summaryKeys", g.summary ? Object.keys(g.summary) : null);
console.log("events0", g.events?.[0] ? Object.keys(g.events[0]) : null);
const shot = g.events?.find(
  (e) =>
    e.locX != null ||
    e.x != null ||
    e.shotX != null ||
    String(e.eventType ?? e.type ?? "").toLowerCase().includes("shot")
);
console.log("shotSample", JSON.stringify(shot)?.slice(0, 800));
console.log("shotCoords", g.summary?.shotCoordinatesAvailable);

// also check 2023-24
const dir2 = "data/drbl/history/drbl-history-v1/2023-24/games";
const f2 = readdirSync(dir2).find((x) => x.endsWith(".json"))!;
const g2 = JSON.parse(readFileSync(path.join(dir2, f2), "utf8")) as {
  summary?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
};
const shot2 = g2.events?.find((e) => e.locX != null || e.x != null);
console.log("2023 keys", Object.keys(g2));
console.log("2023 shot", shot2 ? Object.keys(shot2) : null, JSON.stringify(shot2)?.slice(0, 500));
console.log("2023 coords", g2.summary?.shotCoordinatesAvailable);
