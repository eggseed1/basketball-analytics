import { readFileSync } from "node:fs";

const hist = JSON.parse(
  readFileSync("data/drbl/raw/games/0029600012/playbyplay.json", "utf8")
);
const actions = hist.game.actions as Record<string, unknown>[];
console.log(
  "made",
  JSON.stringify(
    actions.filter((a) => a.actionType === "Made Shot").slice(0, 2),
    null,
    2
  )
);
console.log(
  "ft",
  JSON.stringify(
    actions.filter((a) => a.actionType === "Free Throw").slice(0, 2),
    null,
    2
  )
);
console.log(
  "sub",
  JSON.stringify(
    actions.filter((a) => a.actionType === "Substitution").slice(0, 4),
    null,
    2
  )
);
const modern = JSON.parse(
  readFileSync("data/drbl/raw/games/0022400001/playbyplay.json", "utf8")
);
const types = new Map<string, number>();
for (const a of modern.game.actions as { actionType?: string }[]) {
  const t = String(a.actionType || "");
  types.set(t, (types.get(t) || 0) + 1);
}
console.log(
  "modern types",
  [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
);
