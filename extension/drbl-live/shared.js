/* Shared parser for DRBL's canonical GameSummary API, not a custom extension schema. */
(function (scope) {
  'use strict';
  const LIVE = new Set(['in_progress', 'halftime', 'period_break']);
  const PRE = new Set(['scheduled', 'pregame', 'delayed']);
  const TERMINAL = new Set(['postponed', 'cancelled', 'suspended']);
  const TEAM_ABBRS = ['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];
  const TEAM_COLORS = {
    ATL:'#c8102e',BOS:'#007a33',BKN:'#555555',CHA:'#1d1160',CHI:'#ce1141',CLE:'#860038',DAL:'#00538c',DEN:'#0e2240',DET:'#c8102e',GSW:'#1d428a',HOU:'#ce1141',IND:'#002d62',LAC:'#c8102e',LAL:'#552583',MEM:'#5d76a9',MIA:'#98002e',MIL:'#00471b',MIN:'#0c2340',NOP:'#0c2340',NYK:'#006bb6',OKC:'#007ac1',ORL:'#0077c0',PHI:'#006bb6',PHX:'#1d1160',POR:'#e03a3e',SAC:'#5a2d81',SAS:'#65666a',TOR:'#ce1141',UTA:'#002b5c',WAS:'#002b5c'
  };
  function isLive(status) { return LIVE.has(status); }
  function isFinal(status) { return status === 'final'; }
  function isUpcoming(status) { return PRE.has(status); }
  function showScore(game) {
    if (isLive(game.status) || isFinal(game.status) || game.status === 'suspended') return true;
    if (isUpcoming(game.status) || TERMINAL.has(game.status)) return false;
    return game.awayScore > 0 || game.homeScore > 0;
  }
  function safeAbbr(value) { const v = String(value ?? '').toUpperCase(); return TEAM_ABBRS.includes(v) ? v : ''; }
  function normalizeGame(raw) {
    if (!raw || typeof raw !== 'object' || raw.id == null) return null;
    const away = safeAbbr(raw.awayTeamAbbr);
    const home = safeAbbr(raw.homeTeamAbbr);
    const awayScore = Number(raw.awayScore);
    const homeScore = Number(raw.homeScore);
    const status = typeof raw.status === 'string' ? raw.status : 'unknown';
    const id = String(raw.id);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
    return {
      id, away, home,
      awayName: String(raw.awayTeamName ?? away ?? 'Away'),
      homeName: String(raw.homeTeamName ?? home ?? 'Home'),
      awayRecord: typeof raw.awayRecord === 'string' ? raw.awayRecord : '',
      homeRecord: typeof raw.homeRecord === 'string' ? raw.homeRecord : '',
      awayScore: Number.isFinite(awayScore) ? awayScore : null,
      homeScore: Number.isFinite(homeScore) ? homeScore : null,
      status, period: Number.isFinite(raw.period) ? raw.period : null,
      clock: typeof raw.displayClock === 'string' ? raw.displayClock : '',
      tipOffAt: typeof raw.tipOffAt === 'string' ? raw.tipOffAt : '',
      gameDate: typeof raw.gameDate === 'string' ? raw.gameDate : '',
      statusDetail: typeof raw.statusDetail === 'string' ? raw.statusDetail : '',
      type: typeof raw.gameType === 'string' ? raw.gameType : 'regular'
    };
  }
  function normalizeFeed(feed) {
    if (!feed || !Array.isArray(feed.data)) throw new Error('Unexpected DRBL scoreboard response');
    return feed.data.map(normalizeGame).filter(Boolean);
  }
  function mergeFeeds(today, upcoming) {
    const map = new Map();
    for (const game of [...upcoming, ...today]) map.set(game.id, game);
    return [...map.values()];
  }
  function favorited(game, favorites) { return favorites.includes(game.away) || favorites.includes(game.home); }
  function byPriority(games, favorites) {
    return [...games].sort((a,b) => {
      const liveDelta = Number(isLive(b.status)) - Number(isLive(a.status));
      if (liveDelta) return liveDelta;
      const favDelta = Number(favorited(b, favorites)) - Number(favorited(a, favorites));
      if (favDelta) return favDelta;
      const finalDelta = Number(isFinal(a.status)) - Number(isFinal(b.status));
      if (finalDelta) return finalDelta;
      return (a.tipOffAt || a.gameDate).localeCompare(b.tipOffAt || b.gameDate);
    });
  }
  function gameStatus(game) {
    if (game.status === 'halftime') return 'Halftime';
    if (game.status === 'period_break') return game.period ? `End of Q${game.period}` : 'Period break';
    if (game.status === 'in_progress') {
      const p = game.period ? (game.period > 4 ? `OT${game.period - 4}` : `Q${game.period}`) : 'LIVE';
      return game.clock && !/^0(?::00|\.0)?$/.test(game.clock) ? `${p} · ${game.clock}` : p;
    }
    if (game.status === 'final') return game.period > 4 ? (game.period === 5 ? 'Final · OT' : `Final · ${game.period - 4}OT`) : 'Final';
    const other = {scheduled:'Scheduled',pregame:'Pregame',delayed:'Delayed',postponed:'Postponed',cancelled:'Cancelled',suspended:'Suspended'};
    return other[game.status] || 'Status unavailable';
  }
  function nbaDateNow(date) {
    return new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York', year:'numeric',month:'2-digit',day:'2-digit'}).format(date).replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$1-$2');
  }
  const API_BASE = 'https://drbl.io';
  scope.DRBL = { API_BASE, TEAM_ABBRS, TEAM_COLORS, isLive, isFinal, isUpcoming, showScore, normalizeGame, normalizeFeed, mergeFeeds, byPriority, favorited, gameStatus, nbaDateNow };
})(typeof globalThis !== 'undefined' ? globalThis : self);
