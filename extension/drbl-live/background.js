/* Manifest V3 worker. Reuses the same public DRBL feeds as the /scores page. */
importScripts('shared.js');
const {
  API_BASE,
  normalizeFeed,
  mergeFeeds,
  isLive,
  isFinal,
  favorited,
  leadersFromBoxPlayers,
} = DRBL;
const ALARM_NAME = 'drbl-score-refresh';
const BOX_CONCURRENCY = 4;
let inFlight = null;

async function feed(path) {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`DRBL feed returned HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return { games: normalizeFeed(body), isStale: Boolean(body.isStale), source: body.source ?? 'unknown' };
}

async function fetchBoxLeaders(gameId) {
  try {
    const res = await fetch(`${API_BASE}/api/games/${encodeURIComponent(gameId)}/box-score`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    const players = body?.data?.players;
    if (!Array.isArray(players) || !players.length) return null;
    return {
      awayLeaders: leadersFromBoxPlayers(players, false, 3),
      homeLeaders: leadersFromBoxPlayers(players, true, 3),
    };
  } catch {
    return null;
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Attach live box leaders (minutes > 0) for in-progress / final games.
 * Keeps prior leaders when a box pull fails so the popup does not flicker empty.
 */
async function enrichWithBoxLeaders(games, priorById) {
  const needsBox = games.filter((g) => isLive(g.status) || isFinal(g.status));
  if (!needsBox.length) return games;
  const leadersById = new Map();
  await mapPool(needsBox, BOX_CONCURRENCY, async (game) => {
    const leaders = await fetchBoxLeaders(game.id);
    if (leaders) leadersById.set(game.id, leaders);
  });
  return games.map((game) => {
    const fresh = leadersById.get(game.id);
    if (fresh) return { ...game, ...fresh };
    const prior = priorById.get(game.id);
    if (prior?.awayLeaders?.length || prior?.homeLeaders?.length) {
      return {
        ...game,
        awayLeaders: prior.awayLeaders || [],
        homeLeaders: prior.homeLeaders || [],
      };
    }
    return game;
  });
}

async function refreshImpl() {
  const state = await chrome.storage.local.get({
    favorites: [],
    notify: true,
    showScores: true,
    games: [],
    notifiedFinals: [],
  });
  const results = await Promise.allSettled([
    feed('/api/scores/live'),
    feed('/api/scores/upcoming?limit=40'),
  ]);
  if (results.every((r) => r.status === 'rejected')) {
    const failure = results[0].reason;
    await chrome.storage.local.set({
      error: failure?.message || 'DRBL feeds unavailable',
      isStale: true,
    });
    return { ok: false };
  }
  const today = results[0].status === 'fulfilled' ? results[0].value : null;
  const upcoming = results[1].status === 'fulfilled' ? results[1].value : null;
  const savedGames = state.games || [];
  // If one endpoint fails, keep the last known data for that class rather than replacing it with emptiness.
  const todayGames = today ? today.games : savedGames.filter((g) => !DRBL.isUpcoming(g.status));
  const upcomingGames = upcoming ? upcoming.games : savedGames.filter((g) => DRBL.isUpcoming(g.status));
  const merged = mergeFeeds(todayGames, upcomingGames);
  const prior = new Map(savedGames.map((g) => [g.id, g]));
  const games = await enrichWithBoxLeaders(merged, prior);
  const notified = new Set(state.notifiedFinals || []);
  const favoriteTeams = state.favorites || [];
  if (state.notify !== false && today && !today.isStale) {
    for (const game of today.games) {
      const previous = prior.get(game.id);
      if (
        !previous ||
        !isFinal(game.status) ||
        isFinal(previous.status) ||
        notified.has(game.id) ||
        !favorited(game, favoriteTeams)
      ) {
        continue;
      }
      // Only alert after observing this game actually running. No first-sync historical notifications.
      if (!isLive(previous.status)) continue;
      await chrome.notifications.create(`drbl-final-${game.id}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'DRBL · Final',
        message:
          state.showScores === false
            ? `${game.away} at ${game.home} has finished.`
            : `${game.away} ${game.awayScore ?? '–'}  ·  ${game.home} ${game.homeScore ?? '–'}`,
      });
      notified.add(game.id);
    }
  }
  const active = games.filter((g) => isLive(g.status)).length;
  await chrome.action.setBadgeText({ text: active ? String(active) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#c8102e' });
  await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  await chrome.storage.local.set({
    games,
    updatedAt: Date.now(),
    isStale: Boolean(!today || !upcoming || today.isStale || upcoming.isStale),
    error: !today
      ? 'Live feed unavailable; showing saved scores'
      : !upcoming
        ? 'Upcoming schedule unavailable'
        : null,
    notifiedFinals: [...notified].slice(-100),
  });
  return { ok: true, count: games.length };
}

function refresh() {
  if (!inFlight) {
    inFlight = refreshImpl()
      .catch(async (error) => {
        await chrome.storage.local.set({
          error: String(error?.message || error),
          isStale: true,
        });
        return { ok: false };
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

function start() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  void refresh();
}

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void refresh();
});
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === 'refresh') {
    refresh().then(respond);
    return true;
  }
});
