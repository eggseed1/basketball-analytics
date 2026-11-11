/* Shared parser for DRBL's canonical GameSummary API, plus brand asset URLs. */
(function (scope) {
  'use strict';
  const LIVE = new Set(['in_progress', 'halftime', 'period_break']);
  const PRE = new Set(['scheduled', 'pregame', 'delayed']);
  const TERMINAL = new Set(['postponed', 'cancelled', 'suspended']);
  const TEAM_ABBRS = ['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS'];
  /** Primary wash colors from src/lib/nba-brand.ts TEAM_BRANDS. */
  const TEAM_COLORS = {
    ATL:'#E03A3E',BOS:'#007A33',BKN:'#555555',CHA:'#1D1160',CHI:'#CE1141',CLE:'#860038',DAL:'#00538C',DEN:'#0E2240',DET:'#C8102E',GSW:'#1D428A',HOU:'#CE1141',IND:'#002D62',LAC:'#C8102E',LAL:'#552583',MEM:'#5D76A9',MIA:'#98002E',MIL:'#00471B',MIN:'#0C2340',NOP:'#0C2340',NYK:'#006BB6',OKC:'#007AC1',ORL:'#0077C0',PHI:'#006BB6',PHX:'#1D1160',POR:'#E03A3E',SAC:'#5A2D81',SAS:'#C4CED4',TOR:'#CE1141',UTA:'#002B5C',WAS:'#002B5C'
  };
  /** Nicknames from teams-catalog — ScoreTile uses these, not abbr. */
  const TEAM_NICKNAMES = {
    ATL:'Hawks',BOS:'Celtics',BKN:'Nets',CHA:'Hornets',CHI:'Bulls',CLE:'Cavaliers',DAL:'Mavericks',DEN:'Nuggets',DET:'Pistons',GSW:'Warriors',HOU:'Rockets',IND:'Pacers',LAC:'Clippers',LAL:'Lakers',MEM:'Grizzlies',MIA:'Heat',MIL:'Bucks',MIN:'Timberwolves',NOP:'Pelicans',NYK:'Knicks',OKC:'Thunder',ORL:'Magic',PHI:'76ers',PHX:'Suns',POR:'Trail Blazers',SAC:'Kings',SAS:'Spurs',TOR:'Raptors',UTA:'Jazz',WAS:'Wizards'
  };
  /** ESPN teamlogos/nba slug — same map as teamLogoUrl() on the site. */
  const TEAM_LOGO_SLUG = {
    ATL:'atl',BOS:'bos',BKN:'bkn',CHA:'cha',CHI:'chi',CLE:'cle',DAL:'dal',DEN:'den',DET:'det',GSW:'gs',HOU:'hou',IND:'ind',LAC:'lac',LAL:'lal',MEM:'mem',MIA:'mia',MIL:'mil',MIN:'min',NOP:'no',NYK:'ny',OKC:'okc',ORL:'orl',PHI:'phi',PHX:'phx',POR:'por',SAC:'sac',SAS:'sa',TOR:'tor',UTA:'utah',WAS:'wsh'
  };

  function isLive(status) { return LIVE.has(status); }
  function isFinal(status) { return status === 'final'; }
  function isUpcoming(status) { return PRE.has(status); }
  function showScore(game) {
    if (isLive(game.status) || isFinal(game.status) || game.status === 'suspended') return true;
    if (isUpcoming(game.status) || TERMINAL.has(game.status)) return false;
    return game.awayScore > 0 || game.homeScore > 0;
  }
  /** ESPN short codes the scores API passes through (NY, GS, SA, NO, UTAH, WSH, ...). */
  const ABBR_ALIASES = {
    NY:'NYK',GS:'GSW',SA:'SAS',NO:'NOP',NOR:'NOP',UTAH:'UTA',UTH:'UTA',WSH:'WAS',BRK:'BKN',BK:'BKN',PHO:'PHX',CHO:'CHA',CHH:'CHA',GOS:'GSW',SAN:'SAS',NYC:'NYK'
  };
  function safeAbbr(value) {
    const raw = String(value ?? '').trim().toUpperCase();
    const v = ABBR_ALIASES[raw] || raw;
    return TEAM_ABBRS.includes(v) ? v : '';
  }
  function teamLogoUrl(abbr, _size) {
    const slug = TEAM_LOGO_SLUG[safeAbbr(abbr)];
    if (!slug) return '';
    // ESPN’s /nba/100/ path 404s; always use 500 and scale in CSS.
    return `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`;
  }
  function teamShortName(abbr) {
    const key = safeAbbr(abbr);
    return (key && TEAM_NICKNAMES[key]) || key || '';
  }
  /** Prefer primary for matchup wash; skip near-black/white like brandWashColor. */
  function teamWashColor(abbr) {
    const hex = TEAM_COLORS[safeAbbr(abbr)] || '';
    const h = hex.toLowerCase();
    if (!h || h === '#000' || h === '#000000' || h === '#fff' || h === '#ffffff' || h === '#c4ced4') {
      return '#8e8e93';
    }
    return hex || '#8e8e93';
  }
  function espnHeadshotUrl(playerId) {
    const id = String(playerId ?? '').trim();
    if (!/^\d{1,12}$/.test(id)) return '';
    return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
  }
  function shortName(full) {
    const parts = String(full || '').trim().split(/\s+/);
    if (parts.length < 2) return full || '';
    const last = parts[parts.length - 1];
    return `${parts[0][0]}. ${last}`;
  }
  function normalizeLeaders(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => {
        if (!row || row.id == null) return null;
        const id = String(row.id);
        if (!/^\d{1,12}$/.test(id)) return null;
        const pts = Number(row.pts);
        const min = Number(row.min);
        return {
          id,
          name: String(row.name || id),
          short: shortName(row.name || id),
          pts: Number.isFinite(pts) ? pts : 0,
          min: Number.isFinite(min) ? min : 0,
          headshot: espnHeadshotUrl(id),
        };
      })
      .filter(Boolean)
      .slice(0, 4);
  }
  function normalizeGame(raw) {
    if (!raw || typeof raw !== 'object' || raw.id == null) return null;
    const away = safeAbbr(raw.awayTeamAbbr ?? raw.away);
    const home = safeAbbr(raw.homeTeamAbbr ?? raw.home);
    const awayScore = Number(raw.awayScore);
    const homeScore = Number(raw.homeScore);
    const status = typeof raw.status === 'string' ? raw.status : 'unknown';
    const id = String(raw.id);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
    return {
      id,
      away,
      home,
      awayName: String(raw.awayTeamName ?? raw.awayName ?? away ?? 'Away'),
      homeName: String(raw.homeTeamName ?? raw.homeName ?? home ?? 'Home'),
      awayRecord: typeof raw.awayRecord === 'string' ? raw.awayRecord : '',
      homeRecord: typeof raw.homeRecord === 'string' ? raw.homeRecord : '',
      awayScore: Number.isFinite(awayScore) ? awayScore : null,
      homeScore: Number.isFinite(homeScore) ? homeScore : null,
      status,
      period: Number.isFinite(raw.period) ? raw.period : null,
      clock: typeof raw.displayClock === 'string' ? raw.displayClock : (typeof raw.clock === 'string' ? raw.clock : ''),
      tipOffAt: typeof raw.tipOffAt === 'string' ? raw.tipOffAt : '',
      gameDate: typeof raw.gameDate === 'string' ? raw.gameDate : '',
      statusDetail: typeof raw.statusDetail === 'string' ? raw.statusDetail : '',
      type: typeof raw.gameType === 'string' ? raw.gameType : (typeof raw.type === 'string' ? raw.type : 'regular'),
      awayLogo: teamLogoUrl(away, 100),
      homeLogo: teamLogoUrl(home, 100),
      awayLeaders: normalizeLeaders(raw.awayLeaders),
      homeLeaders: normalizeLeaders(raw.homeLeaders),
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
  function favorited(game, favorites) {
    return favorites.includes(game.away) || favorites.includes(game.home);
  }
  function byPriority(games, favorites) {
    return [...games].sort((a, b) => {
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
    if (game.status === 'final') {
      return game.period > 4 ? (game.period === 5 ? 'Final · OT' : `Final · ${game.period - 4}OT`) : 'Final';
    }
    const other = {
      scheduled: 'Scheduled',
      pregame: 'Pregame',
      delayed: 'Delayed',
      postponed: 'Postponed',
      cancelled: 'Cancelled',
      suspended: 'Suspended',
    };
    return other[game.status] || 'Status unavailable';
  }
  function nbaDateNow(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(date)
      .replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$1-$2');
  }

  /**
   * Active contributors from a DRBL box-score payload: players with minutes
   * (in the game), ranked by points then minutes. Cap keeps the popup compact.
   */
  function leadersFromBoxPlayers(players, isHome, limit) {
    const cap = limit ?? 3;
    const rows = (players || [])
      .filter((p) => Boolean(p) && p.isHome === isHome && !p.didNotPlay)
      .filter((p) => (Number(p.minutes) || 0) > 0 || (Number(p.points) || 0) > 0)
      .sort(
        (a, b) =>
          (Number(b.points) || 0) - (Number(a.points) || 0) ||
          (Number(b.minutes) || 0) - (Number(a.minutes) || 0)
      )
      .slice(0, cap)
      .map((p) => ({
        id: String(p.playerId),
        name: String(p.playerName || p.playerId),
        pts: Number(p.points) || 0,
        min: Number(p.minutes) || 0,
      }));
    return normalizeLeaders(rows);
  }

  const API_BASE = 'https://drbl.io';
  scope.DRBL = {
    API_BASE,
    TEAM_ABBRS,
    TEAM_COLORS,
    TEAM_NICKNAMES,
    TEAM_LOGO_SLUG,
    isLive,
    isFinal,
    isUpcoming,
    showScore,
    safeAbbr,
    teamLogoUrl,
    teamShortName,
    teamWashColor,
    espnHeadshotUrl,
    shortName,
    normalizeGame,
    normalizeFeed,
    mergeFeeds,
    byPriority,
    favorited,
    gameStatus,
    nbaDateNow,
    leadersFromBoxPlayers,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
