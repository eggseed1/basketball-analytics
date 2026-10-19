import assert from "node:assert/strict";
import test from "node:test";

import { buyoutOf, hireQuote, staffBillM, withHeadCoach } from "../src/gm/engine/staff";
import { coachForTeam, openCoachMarket, staffBudgetM } from "../src/gm/seed/coaches";
import { createGeneratedLeague } from "../src/gm/seed/create-league";
import type { GmTeam } from "../src/gm/types";

test("every franchise has a named 2026-27 coach with a salary", () => {
  const league = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 4 });
  const bos = league.teams.find((team) => team.id === "bos")!;
  assert.equal(bos.staff.headCoach.name, "Joe Mazzulla");
  assert.equal(bos.staff.headCoach.salaryReported, true);
  assert.ok((bos.staff.headCoach.salaryM ?? 0) >= 8);
  assert.equal(league.teams.filter((team) => team.staff.headCoach.name === "Head Coach").length, 0);
  const kerr = league.teams.find((team) => team.id === "gsw")!.staff.headCoach;
  assert.equal(kerr.salaryM, 17.5);
  const christie = league.teams.find((team) => team.id === "sac")!.staff.headCoach;
  assert.equal(christie.salaryM, 2);
  const bill = staffBillM(bos);
  assert.ok(bill > (bos.staff.headCoach.salaryM ?? 0));
  assert.ok(bill < staffBudgetM(bos, false) + 8);
});

test("a coach with years left cannot be replaced for free", () => {
  const league = createGeneratedLeague({ userTeamId: "bos", season: 2027, seed: 5 });
  const bos = league.teams.find((team) => team.id === "bos")!;
  const doc = openCoachMarket().find((coach) => coach.name === "Doc Rivers")!;
  const tight = {
    ...bos,
    ownerGoal: "tank",
    ownerPatience: 20,
    staff: {
      ...bos.staff,
      headCoach: { ...bos.staff.headCoach, salaryM: 15, yearsLeft: 4, walkYear: false },
      scout: bos.staff.scout ? { ...bos.staff.scout, salaryM: 2 } : bos.staff.scout,
    },
  } as GmTeam;
  const blocked = hireQuote(tight, true, doc, "head");
  assert.equal(blocked.ok, false);
  const hired = withHeadCoach(tight, doc);
  const buyout = buyoutOf(tight.staff.headCoach);
  assert.ok(buyout && buyout.annualM > 0);
  assert.equal(hired.staff.dead?.[0]?.name, "Joe Mazzulla");
  assert.ok(staffBillM(hired) > staffBillM({ ...tight, staff: { ...tight.staff, headCoach: doc, dead: [] } }));
});
