/**
 * Run: npx tsx --test src/lib/visit-seen.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import { isNewInVisit, nextVisit, recordSeen } from "@/lib/visit-seen";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

test("a first visit tags nothing", () => {
  const visit = nextVisit(null, 0, 1000);
  assert.equal(visit.returning, false);
  assert.equal(isNewInVisit({}, visit, "a"), false);
});

test("items first shown in this visit stay new on reload; older ones don't", () => {
  const t0 = 10 * DAY;
  let seen = recordSeen({}, ["a"], t0);
  const visit = nextVisit({ start: t0, lastActive: t0, returning: false }, 1, t0 + 2 * DAY);
  assert.equal(visit.start, t0 + 2 * DAY);
  assert.equal(visit.returning, true);
  assert.equal(isNewInVisit(seen, visit, "a"), false);
  assert.equal(isNewInVisit(seen, visit, "b"), true);
  seen = recordSeen(seen, ["a", "b"], t0 + 2 * DAY);
  const reload = nextVisit(visit, 2, t0 + 2 * DAY + 5 * MIN);
  assert.equal(reload.start, visit.start);
  assert.equal(isNewInVisit(seen, reload, "b"), true);
  const later = nextVisit(reload, 2, t0 + 3 * DAY);
  assert.equal(isNewInVisit(seen, later, "b"), false);
});

test("ids keep their first sighting and drop after 45 days unseen", () => {
  let seen = recordSeen({}, ["a", "b"], 0);
  seen = recordSeen(seen, ["a"], 40 * DAY);
  assert.deepEqual(seen.a, [0, 40 * DAY]);
  seen = recordSeen(seen, [], 46 * DAY);
  assert.ok(seen.a);
  assert.equal(seen.b, undefined);
});
