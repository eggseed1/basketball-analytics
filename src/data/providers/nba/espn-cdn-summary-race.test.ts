/**
 * Application-level F4 races for ESPN CDN summary isolation.
 * Mocks global fetch; does not hit live ESPN.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  __resetEspnCdnSummaryCacheForTests,
  fetchEspnCdnGameSummary,
} from "./espn-cdn-summary";

function summary(opts: {
  id: string;
  plays?: number;
  boxers?: number;
  state?: string;
}): Record<string, unknown> {
  const athletes = Array.from({ length: opts.boxers ?? 0 }, (_, i) => ({
    athlete: { id: String(1000 + i), displayName: `P${i}` },
    stats: ["20", "10"],
  }));
  return {
    header: {
      id: opts.id,
      competitions: [
        {
          id: opts.id,
          status: { type: { state: opts.state ?? "post" } },
          competitors: [
            { homeAway: "home", team: { id: "1" } },
            { homeAway: "away", team: { id: "2" } },
          ],
        },
      ],
    },
    plays: Array.from({ length: opts.plays ?? 0 }, (_, i) => ({ id: i })),
    boxscore:
      (opts.boxers ?? 0) > 0
        ? {
            players: [
              {
                team: { id: "1" },
                statistics: [{ names: ["MIN", "PTS"], athletes }],
              },
            ],
          }
        : { players: [] },
  };
}

type FetchCall = { url: string; at: number };

describe("ESPN CDN summary application races (F4)", () => {
  const calls: FetchCall[] = [];
  let originalFetch: typeof fetch;

  beforeEach(() => {
    __resetEspnCdnSummaryCacheForTests();
    calls.length = 0;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __resetEspnCdnSummaryCacheForTests();
  });

  function mockByUrl(handler: (url: string) => Promise<unknown> | unknown) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push({ url, at: Date.now() });
      const body = await handler(url);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  it("concurrent preferPlays + preferBox do not share one promise", async () => {
    const id = "401900001";
    let playsHits = 0;
    let boxHits = 0;
    mockByUrl(async (url) => {
      if (url.includes("/playbyplay")) {
        playsHits += 1;
        await new Promise((r) => setTimeout(r, 40));
        return { gamepackageJSON: summary({ id, plays: 10, boxers: 0 }) };
      }
      if (url.includes("/boxscore")) {
        boxHits += 1;
        await new Promise((r) => setTimeout(r, 40));
        return { gamepackageJSON: summary({ id, plays: 0, boxers: 8 }) };
      }
      // /game — slow plays-only trap
      await new Promise((r) => setTimeout(r, 80));
      return { gamepackageJSON: summary({ id, plays: 12, boxers: 0 }) };
    });

    const [plays, box] = await Promise.all([
      fetchEspnCdnGameSummary(id, { preferPlays: true }),
      fetchEspnCdnGameSummary(id, { preferBox: true }),
    ]);

    assert.ok(plays, "plays summary present");
    assert.ok(box, "box summary present");
    const boxAthletes =
      (
        box as {
          boxscore?: { players?: Array<{ statistics?: Array<{ athletes?: unknown[] }> }> };
        }
      ).boxscore?.players?.[0]?.statistics?.[0]?.athletes?.length ?? 0;
    assert.equal(boxAthletes, 8, "box caller must receive athletes");
    assert.ok(playsHits >= 1 && boxHits >= 1, "both package types fetched");
    // Distinct coalesce → both lanes can run; box must not be stuck with plays-only.
    assert.ok(
      !calls.every((c) => c.url.includes("playbyplay")),
      "box lane must hit non-playbyplay URL"
    );
  });

  it("plays-only memo does not satisfy a later preferBox call", async () => {
    const id = "401900002";
    let phase: "plays" | "box" = "plays";
    mockByUrl(async (url) => {
      if (phase === "plays") {
        return { gamepackageJSON: summary({ id, plays: 5, boxers: 0 }) };
      }
      if (url.includes("/boxscore")) {
        return { gamepackageJSON: summary({ id, plays: 5, boxers: 6 }) };
      }
      return { gamepackageJSON: summary({ id, plays: 5, boxers: 0 }) };
    });

    const first = await fetchEspnCdnGameSummary(id, { preferPlays: true });
    assert.ok(first);
    const firstAthletes =
      (
        first as {
          boxscore?: { players?: Array<{ statistics?: Array<{ athletes?: unknown[] }> }> };
        }
      ).boxscore?.players?.[0]?.statistics?.[0]?.athletes?.length ?? 0;
    assert.equal(firstAthletes, 0);

    phase = "box";
    const second = await fetchEspnCdnGameSummary(id, { preferBox: true });
    assert.ok(second);
    const secondAthletes =
      (
        second as {
          boxscore?: { players?: Array<{ statistics?: Array<{ athletes?: unknown[] }> }> };
        }
      ).boxscore?.players?.[0]?.statistics?.[0]?.athletes?.length ?? 0;
    assert.equal(secondAthletes, 6, "preferBox must refetch after plays-only");
  });

  it("shell maxUrls:1 plays-only does not poison later box", async () => {
    const id = "401900003";
    mockByUrl(async (url) => {
      if (url.includes("/boxscore")) {
        return { gamepackageJSON: summary({ id, plays: 3, boxers: 4 }) };
      }
      // First shell URL under preferBox/maxUrls order is boxscore; force failure once.
      if (url.includes("/playbyplay") || url.includes("/game")) {
        return { gamepackageJSON: summary({ id, plays: 9, boxers: 0 }) };
      }
      return { gamepackageJSON: summary({ id, plays: 1, boxers: 0 }) };
    });

    // Simulate shell that only got a plays package somehow via maxUrls on play order
    const shell = await fetchEspnCdnGameSummary(id, {
      preferPlays: true,
      maxUrls: 1,
      timeoutMs: 2_000,
    });
    assert.ok(shell);

    const box = await fetchEspnCdnGameSummary(id, { preferBox: true });
    const athletes =
      (
        box as {
          boxscore?: { players?: Array<{ statistics?: Array<{ athletes?: unknown[] }> }> };
        }
      )?.boxscore?.players?.[0]?.statistics?.[0]?.athletes?.length ?? 0;
    assert.equal(athletes, 4);
  });

  it("transient boxscore failure then recovery on next preferBox", async () => {
    const id = "401900004";
    let failBox = true;
    mockByUrl(async (url) => {
      if (url.includes("/boxscore")) {
        if (failBox) {
          failBox = false;
          throw new Error("upstream 503");
        }
        return { gamepackageJSON: summary({ id, plays: 2, boxers: 5 }) };
      }
      return { gamepackageJSON: summary({ id, plays: 2, boxers: 0 }) };
    });

    const miss = await fetchEspnCdnGameSummary(id, { preferBox: true });
    // May return plays-only best or null depending on other URLs
    const missAthletes =
      (
        miss as {
          boxscore?: { players?: Array<{ statistics?: Array<{ athletes?: unknown[] }> }> };
        } | null
      )?.boxscore?.players?.[0]?.statistics?.[0]?.athletes?.length ?? 0;
    assert.equal(missAthletes, 0);

    const hit = await fetchEspnCdnGameSummary(id, { preferBox: true });
    const hitAthletes =
      (
        hit as {
          boxscore?: { players?: Array<{ statistics?: Array<{ athletes?: unknown[] }> }> };
        } | null
      )?.boxscore?.players?.[0]?.statistics?.[0]?.athletes?.length ?? 0;
    assert.equal(hitAthletes, 5, "retry after transient miss must recover");
  });

  it("different games do not coalesce", async () => {
    const a = "401900005";
    const b = "401900006";
    mockByUrl(async (url) => {
      const id = url.includes(a) ? a : b;
      await new Promise((r) => setTimeout(r, 30));
      return { gamepackageJSON: summary({ id, plays: 1, boxers: 3 }) };
    });

    const [sa, sb] = await Promise.all([
      fetchEspnCdnGameSummary(a, { preferBox: true }),
      fetchEspnCdnGameSummary(b, { preferBox: true }),
    ]);
    assert.equal((sa as { header?: { id?: string } })?.header?.id, a);
    assert.equal((sb as { header?: { id?: string } })?.header?.id, b);
  });

  it("legitimate zero-athlete package is not memoized as a box hit", async () => {
    const id = "401900007";
    let n = 0;
    mockByUrl(async () => {
      n += 1;
      if (n === 1) {
        return { gamepackageJSON: summary({ id, plays: 4, boxers: 0 }) };
      }
      return { gamepackageJSON: summary({ id, plays: 4, boxers: 2 }) };
    });

    await fetchEspnCdnGameSummary(id, { preferBox: true });
    const second = await fetchEspnCdnGameSummary(id, { preferBox: true });
    const athletes =
      (
        second as {
          boxscore?: { players?: Array<{ statistics?: Array<{ athletes?: unknown[] }> }> };
        } | null
      )?.boxscore?.players?.[0]?.statistics?.[0]?.athletes?.length ?? 0;
    assert.equal(athletes, 2);
    assert.ok(n >= 2, "zero-athlete result must not sticky-cache as box");
  });
});
