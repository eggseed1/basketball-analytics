import { eliteYouthLabel } from "./career";
import { peerName } from "./names";
import { clamp, rngOf, type Streams } from "./rng";
import type { NodeKind, Peer } from "./types";
import { country, domesticProLeagues, PLAYABLE_COUNTRIES } from "./world";

/**
 * Four simulated lives born the same year. Each peer reads only its own
 * stream and the calendar, never the player's state, so the player's choices
 * cannot change them.
 */

export function createPeers(streams: Streams): Peer[] {
  return streams.peers.map((_, i) => {
    const rng = rngOf(streams, i);
    const c = rng.weighted(PLAYABLE_COUNTRIES, (x) => x.draw.weight);
    const potential = Math.round(clamp(rng.normal(64, 9), 35, 92));
    return {
      id: `p${i}`,
      name: peerName(rng, c.id),
      countryId: c.id,
      heightCm: Math.round(clamp(rng.normal(184, 9), 160, 225)),
      rating: 2,
      potential,
      status: "Newborn",
      levelLabel: "Home",
      node: "home" as NodeKind,
      drafted: null,
      debutMonth: null,
      done: false,
      log: [],
    };
  });
}

/** Advance every peer by one year. `ageYears` is the shared birth-year age. */
export function stepPeersYear(streams: Streams, peers: Peer[], ageYears: number, month: number) {
  peers.forEach((p, i) => {
    if (p.done) return;
    const rng = rngOf(streams, i);
    const growth = ageYears < 20 ? (p.potential - p.rating) * clamp(0.08 + ageYears * 0.006, 0.05, 0.2) : (p.potential - p.rating) * 0.12;
    p.rating = clamp(p.rating + growth + rng.normal(0, 1.6), 0, 99);
    const top = domesticProLeagues(p.countryId)[0];
    const c = country(p.countryId);
    let node: NodeKind = p.node;
    let label = p.levelLabel;
    let status = p.status;
    if (ageYears < 6) {
      node = "home";
      label = "Home";
      status = "Growing up";
    } else if (ageYears < 12) {
      node = rng.chance(0.6) ? "local-club" : "playground";
      label = node === "local-club" ? `Club youth team, ${c.name}` : "Neighborhood courts";
      status = node === "local-club" ? "Playing club ball" : "Playing outside";
    } else if (ageYears < 18) {
      const elite = p.rating > 34 + (ageYears - 12) * 4 && top;
      node = elite ? "elite-youth" : rng.chance(0.15 - (ageYears - 12) * 0.02) ? "playground" : "local-club";
      label = elite ? eliteYouthLabel(c.id, top!.id) : node === "local-club" ? `Club youth team, ${c.name}` : "Stopped playing organized ball";
      status = node === "playground" ? "Left organized basketball" : elite ? "Top youth prospect" : "Youth player";
      if (node === "playground" && ageYears >= 15) {
        p.done = true;
        status = "Left basketball for school and work";
      }
    } else {
      const lvl = p.rating;
      if (p.drafted || lvl >= 76) {
        node = "nba";
        label = "NBA";
        if (!p.drafted && ageYears <= 23 && lvl >= 76) {
          p.drafted = { year: ageYears, pick: Math.max(1, Math.round(60 - (lvl - 74) * 6 + rng.normal(0, 6))) };
          if (p.drafted.pick > 60) p.drafted = null;
        }
        if (p.debutMonth === null && lvl >= 77) {
          p.debutMonth = month;
          status = "Made his NBA debut";
        } else status = p.drafted ? `Drafted, pick ${p.drafted.pick}` : "On an NBA fringe deal";
      } else if (lvl >= 62 && top) {
        node = "domestic-pro";
        label = top.name;
        status = "Professional";
      } else if (lvl >= 50) {
        node = "local-senior";
        label = top ? `Lower division, ${c.name}` : `Senior club, ${c.name}`;
        status = "Semi-pro";
      } else {
        node = "unattached";
        label = "Out of basketball";
        status = "Moved on from basketball";
        if (ageYears >= 22) p.done = true;
      }
      if (ageYears >= 30) p.done = true;
    }
    if (label !== p.levelLabel) p.log.push({ month, text: `${label}` });
    p.node = node;
    p.levelLabel = label;
    p.status = status;
  });
}
