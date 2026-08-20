import { readFileSync } from "node:fs";

const j = JSON.parse(
  readFileSync(
    "data/drbl/history/drbl-history-v1/2005-06/games/0020500001.json",
    "utf8"
  )
);
const sizes = Object.fromEntries(
  Object.keys(j).map((k) => [
    k,
    Buffer.byteLength(JSON.stringify(j[k]), "utf8"),
  ])
);
console.log(JSON.stringify(sizes, null, 2));
