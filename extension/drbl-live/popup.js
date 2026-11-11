'use strict';
const {
  isLive,
  isFinal,
  isUpcoming,
  showScore,
  gameStatus,
  favorited,
  nbaDateNow,
  teamLogoUrl,
  teamShortName,
  teamWashColor,
} = DRBL;

const $ = (id) => document.getElementById(id);
let currentFilter = 'all';
let snapshot = {
  games: [],
  favorites: [],
  updatedAt: null,
  isStale: false,
  error: null,
  theme: 'system',
  showScores: true,
};

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function fmtTip(tip) {
  if (!tip || Number.isNaN(new Date(tip).valueOf())) return 'Time TBD';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(tip));
}

function dateLabel(tip, gameDate) {
  const date = tip ? new Date(tip) : new Date(`${gameDate}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return 'Upcoming';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(date);
}

function applyTheme(theme) {
  const root = document.documentElement;
  const mode = theme === 'light' || theme === 'dark' ? theme : 'system';
  root.dataset.theme = mode;
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
}

function teamMark(abbr) {
  const img = el('img', 'team-mark');
  const url = teamLogoUrl(abbr);
  img.alt = '';
  img.width = 28;
  img.height = 28;
  img.decoding = 'async';
  img.loading = 'lazy';
  img.dataset.logo = 'sm';
  if (url) {
    img.src = url;
    img.addEventListener('error', () => {
      img.replaceWith(el('span', 'team-mark-fallback', abbr || '?'));
    });
  } else {
    return el('span', 'team-mark-fallback', abbr || '?');
  }
  return img;
}

function teamRow(game, side, score, emphasis, winner) {
  const abbr = side === 'away' ? game.away : game.home;
  const recordRaw = (side === 'away' ? game.awayRecord : game.homeRecord)?.trim();
  const record = recordRaw && recordRaw !== '0-0' ? recordRaw : null;

  const mark = teamMark(abbr);

  const identity = el('div', 'team-identity');
  const name = el(
    'span',
    'team-name' + (emphasis === 'muted' ? ' is-muted' : ''),
    teamShortName(abbr) ||
      (side === 'away' ? game.awayName : game.homeName) ||
      (side === 'away' ? 'Away' : 'Home')
  );
  identity.append(name);
  if (record) identity.append(el('span', 'team-record', record));

  const scoreCell = el('span', 'score-cell');
  if (score != null) {
    scoreCell.append(
      el(
        'span',
        'team-score' +
          (emphasis === 'strong' ? ' is-leading' : '') +
          (emphasis === 'muted' ? ' is-muted' : ''),
        score
      )
    );
  }
  const marker = el('span', 'win-marker' + (winner ? '' : ' is-hidden'));
  marker.setAttribute('aria-hidden', 'true');
  scoreCell.append(marker);

  return [mark, identity, scoreCell];
}

function headshotStack(players, showPts) {
  if (!players?.length) return null;
  const row = el('div', 'headshot-stack');
  for (const p of players.slice(0, 3)) {
  const chip = el('span', 'headshot-chip');
  chip.dataset.avatar = 'xs';
  chip.title = showPts && p.pts != null ? `${p.name} · ${p.pts} pts` : p.name;
    if (p.headshot) {
      const img = el('img', 'headshot');
      img.src = p.headshot;
      img.alt = '';
      img.width = 22;
      img.height = 22;
      img.decoding = 'async';
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.replaceWith(el('span', 'headshot-fallback', (p.short || p.name || '?').slice(0, 1)));
      });
      chip.append(img);
    } else {
      chip.append(el('span', 'headshot-fallback', (p.short || p.name || '?').slice(0, 1)));
    }
    row.append(chip);
  }
  return row;
}

function playersFooter(game, showScores) {
  const away = game.awayLeaders || [];
  const home = game.homeLeaders || [];
  if (!away.length && !home.length) return null;

  const footer = el('div', 'tile-footer');
  if (away.length) {
    const side = el('div', 'starter-side');
    side.append(el('span', 'starter-label', game.away || 'AWAY'));
    const stack = headshotStack(away, showScores);
    if (stack) side.append(stack);
    footer.append(side);
  }
  if (home.length) {
    const side = el('div', 'starter-side starter-side--home');
    const stack = headshotStack(home, showScores);
    if (stack) side.append(stack);
    side.append(el('span', 'starter-label', game.home || 'HOME'));
    footer.append(side);
  }
  return footer;
}

function matchupOrbs(awayColor, homeColor, winner) {
  const wrap = el('span', 'strip-orbs');
  wrap.setAttribute('aria-hidden', 'true');
  const strength = (side) => (winner == null ? 0.8 : winner === side ? 1 : 0.45);
  const away = el('span', 'strip-orb');
  away.style.setProperty('--orb-color', awayColor);
  away.style.setProperty('--orb-strength', String(strength('away')));
  away.style.left = '-60px';
  away.style.top = '2px';
  const home = el('span', 'strip-orb strip-orb--b');
  home.style.setProperty('--orb-color', homeColor);
  home.style.setProperty('--orb-strength', String(strength('home')));
  home.style.right = '-60px';
  home.style.bottom = '-16px';
  const rim = el('span', 'matchup-rim');
  rim.style.setProperty('--rim-away', awayColor);
  rim.style.setProperty('--rim-home', homeColor);
  wrap.append(away, home, rim);
  return wrap;
}

function scoreTile(game, favorites, showScoresPref) {
  const show = showScoresPref && showScore(game) && game.awayScore != null && game.homeScore != null;
  const final = isFinal(game.status);
  const live = isLive(game.status);
  const awayWash = teamWashColor(game.away);
  const homeWash = teamWashColor(game.home);
  const awayAhead = show && game.awayScore > game.homeScore;
  const homeAhead = show && game.homeScore > game.awayScore;
  const emphasisFor = (ahead, behind) => (ahead ? 'strong' : behind && final ? 'muted' : 'plain');
  let winner = null;
  if (final && show && game.awayScore !== game.homeScore) {
    winner = awayAhead ? 'away' : 'home';
  }

  const card = el('article', 'sports-card score-tile' + (live ? ' is-live' : ''));
  card.dataset.motion = 'card';
  card.dataset.motionTile = '';
  if (favorited(game, favorites)) card.classList.add('is-favorite');
  card.append(matchupOrbs(awayWash, homeWash, winner));

  const hit = el('a', 'tile-hit');
  hit.href = `https://drbl.io/games/${encodeURIComponent(game.id)}`;
  hit.target = '_blank';
  hit.rel = 'noopener noreferrer';
  hit.setAttribute(
    'aria-label',
    `${teamShortName(game.away) || game.away} at ${teamShortName(game.home) || game.home}`
  );
  card.append(hit);

  const body = el('div', 'tile-body');

  const statusRow = el('div', 'status-row');
  const status = el('span', 'status-line');
  if (live) {
    const liveBadge = el('span', 'live-indicator');
    liveBadge.append(el('span', 'live-ping'), el('span', '', 'LIVE'));
    status.append(liveBadge);
    const clock = gameStatus(game);
    if (clock && clock !== 'LIVE') status.append(el('span', 'status-clock', clock));
  } else if (isUpcoming(game.status)) {
    status.append(el('span', 'status-clock', fmtTip(game.tipOffAt)));
  } else {
    status.append(el('span', 'status-tag', gameStatus(game)));
  }
  statusRow.append(status);

  if (game.type && game.type !== 'regular') {
    statusRow.append(
      el(
        'span',
        'glass-pill type-badge',
        game.type === 'play-in' ? 'Play-In' : game.type === 'playoff' ? 'Playoffs' : 'Preseason'
      )
    );
  }
  body.append(statusRow);

  const rows = el('div', 'team-rows');
  rows.append(
    ...teamRow(
      game,
      'away',
      show ? game.awayScore : null,
      emphasisFor(awayAhead, homeAhead),
      final && awayAhead
    ),
    ...teamRow(
      game,
      'home',
      show ? game.homeScore : null,
      emphasisFor(homeAhead, awayAhead),
      final && homeAhead
    )
  );
  body.append(rows);

  const footer = playersFooter(game, showScoresPref);
  if (footer) body.append(footer);

  card.append(body);
  return card;
}

function visibleGames(games) {
  if (currentFilter === 'favorites') return games.filter((g) => favorited(g, snapshot.favorites));
  if (currentFilter === 'live') return games.filter((g) => isLive(g.status));
  return games;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let revealedOnce = false;
let tileObserver = null;

function observeTiles(scope) {
  const tiles = [...scope.querySelectorAll('.score-tile:not(.is-in)')];
  if (!tiles.length) return;
  if (reduceMotion) {
    tiles.forEach((tile) => tile.classList.add('is-in'));
    return;
  }
  if (tileObserver) tileObserver.disconnect();
  const scroller = document.querySelector('.popup-main');
  tileObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        tileObserver.unobserve(entry.target);
      }
    },
    { root: scroller, threshold: 0.14, rootMargin: '0px 0px -6% 0px' }
  );
  tiles.forEach((tile) => tileObserver.observe(tile));
}

function renderSection(id, listId, games, favorites, showScores, animate) {
  const section = $(id);
  section.hidden = !games.length;
  const parent = $(listId);
  const tiles = games.map((game, index) => {
    const tile = scoreTile(game, favorites, showScores);
    tile.style.setProperty('--i', String(Math.min(index, 12)));
    if (!animate) tile.classList.add('is-in');
    return tile;
  });
  parent.replaceChildren(...tiles);
}

function render(opts = {}) {
  applyTheme(snapshot.theme);
  const animate = Boolean(opts.animate) || !revealedOnce;
  const all = snapshot.games || [];
  const selected = visibleGames(all);
  const live = selected.filter((g) => isLive(g.status));
  const todayString = nbaDateNow(new Date());
  const today = selected.filter((g) => !isLive(g.status) && g.gameDate === todayString);
  const upcoming = selected
    .filter((g) => !isLive(g.status) && isUpcoming(g.status) && g.gameDate !== todayString)
    .sort((a, b) => (a.tipOffAt || '').localeCompare(b.tipOffAt || ''))
    .slice(0, 6);
  const other = selected.filter(
    (g) => !live.includes(g) && !today.includes(g) && !upcoming.includes(g) && !isUpcoming(g.status)
  );
  const todayShown = [...today, ...other].sort((a, b) => (a.tipOffAt || '').localeCompare(b.tipOffAt || ''));
  const showScores = snapshot.showScores !== false;

  renderSection('live-section', 'live-games', live, snapshot.favorites, showScores, animate);
  renderSection('today-section', 'today-games', todayShown, snapshot.favorites, showScores, animate);
  renderSection('upcoming-section', 'upcoming-games', upcoming, snapshot.favorites, showScores, animate);

  if (animate) {
    requestAnimationFrame(() => observeTiles(document.querySelector('.popup-main-inner') || document));
  }
  if (selected.length) revealedOnce = true;

  $('live-count').textContent = String(all.filter((g) => isLive(g.status)).length);
  $('live-meta').textContent = `${live.length} game${live.length !== 1 ? 's' : ''}`;
  $('today-meta').textContent = `${todayShown.length} game${todayShown.length !== 1 ? 's' : ''}`;
  $('upcoming-meta').textContent = upcoming.length
    ? dateLabel(upcoming[0].tipOffAt, upcoming[0].gameDate)
    : '';
  $('updated').textContent = snapshot.updatedAt
    ? `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(snapshot.updatedAt))}`
    : 'Waiting for first sync';

  const stale = Boolean(snapshot.isStale || snapshot.error);
  $('feed-indicator').classList.toggle('offline', stale);
  $('feed-label').textContent = stale ? 'Delayed' : 'Connected';
  $('feed-indicator').title = stale ? 'DRBL feed is unavailable or delayed' : 'Using DRBL live scores';
  $('feedback').hidden = !stale;
  $('feedback').textContent = stale ? snapshot.error || 'Some scores may be delayed.' : '';

  const empty = selected.length === 0;
  $('empty-state').hidden = !empty;
  if (empty) {
    $('empty-title').textContent =
      currentFilter === 'favorites'
        ? 'No favorite games'
        : currentFilter === 'live'
          ? 'No live games right now'
          : 'No games to show';
    $('empty-text').textContent =
      currentFilter === 'favorites'
        ? 'Pick teams in Settings to pin them here.'
        : currentFilter === 'live'
          ? 'Check back when tip-off starts.'
          : stale
            ? 'Scores are temporarily unavailable. Try refreshing.'
            : 'NBA games will show up here when the schedule is live.';
  }

  document.querySelectorAll('.filter').forEach((button) => {
    const active = button.dataset.filter === currentFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

async function load() {
  snapshot = {
    ...snapshot,
    ...(await chrome.storage.local.get([
      'games',
      'updatedAt',
      'error',
      'isStale',
      'favorites',
      'theme',
      'showScores',
    ])),
  };
  render();
}

document.querySelectorAll('.filter').forEach((button) =>
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    render({ animate: true });
  })
);

$('refresh').addEventListener('click', async () => {
  const btn = $('refresh');
  btn.disabled = true;
  btn.classList.add('is-spinning');
  try {
    await chrome.runtime.sendMessage({ type: 'refresh' });
  } finally {
    btn.disabled = false;
    window.setTimeout(() => btn.classList.remove('is-spinning'), 500);
    await load();
  }
});

$('open-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.querySelectorAll('[data-open-options]').forEach((node) =>
  node.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  })
);

chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === 'local' &&
    Object.keys(changes).some((k) =>
      ['games', 'updatedAt', 'error', 'isStale', 'favorites', 'theme', 'showScores'].includes(k)
    )
  ) {
    void load();
  }
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((snapshot.theme || 'system') === 'system') applyTheme('system');
});

void load().then(() => {
  if (!snapshot.updatedAt || Date.now() - snapshot.updatedAt > 25_000) {
    chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
  }
});
