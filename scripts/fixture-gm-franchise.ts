import { writeFileSync } from "node:fs";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import { exportFranchise, prepareFranchise } from "../src/gm/engine/franchise";
const league = prepareFranchise(createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 83 }));
writeFileSync(process.argv[2] ?? "/tmp/franchise-qa.json", exportFranchise(league));
