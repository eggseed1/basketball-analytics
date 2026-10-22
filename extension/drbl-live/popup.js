'use strict';
const { TEAM_COLORS, isLive, isFinal, isUpcoming, showScore, gameStatus, favorited, nbaDateNow } = DRBL;
const $ = id => document.getElementById(id);
let currentFilter = 'all';
let snapshot = { games:[], favorites:[], updatedAt:null, isStale:false, error:null, theme:'system', showScores:true };

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

function makeTeamRow(game, side, show, leader, final) {
  const team = side === 'away' ? game.away : game.home;
  const avatar = el('span', 'team-mark', team || '?');
  avatar.style.setProperty('--team-color', TEAM_COLORS[team] || '#67748a');
  avatar.setAttribute('aria-hidden', 'true');

  const identity = el('span', 'team-identity');
  const name = el('span', 'team-name' + (show && final && !leader ? ' is-muted' : ''), team || (side === 'away' ? 'Away' : 'Home'));
  identity.append(name);
  const rec = side === 'away' ? game.awayRecord : game.homeRecord;
  if (rec && rec !== '0-0') identity.append(el('span', 'record', rec));

  const scoreCell = el('span', 'score-cell');
  const score = el(
    'span',
    'team-score' + (show && final && !leader ? ' trailing' : '') + (show && leader ? ' leading' : ''),
    show ? (side === 'away' ? game.awayScore : game.homeScore) : ''
  );
  const marker = el('span', 'win-marker' + (show && final && leader ? '' : ' is-hidden'));
  marker.setAttribute('aria-hidden', 'true');
  scoreCell.append(score, marker);

  return { avatar, identity, scoreCell };
}

function orbLayer(awayColor, homeColor, winner) {
  const wrap = el('span', 'strip-orbs');
  wrap.setAttribute('aria-hidden', 'true');
  const strength = (side) => (winner == null ? 0.8 : winner === side ? 1 : 0.45);
  const away = el('span', 'strip-orb');
  away.style.setProperty('--orb-color', awayColor);
  away.style.setProperty('--orb-strength', String(strength('away')));
  away.style.left = '-48px';
  away.style.top = '2px';
  const home = el('span', 'strip-orb strip-orb--b');
  home.style.setProperty('--orb-color', homeColor);
  home.style.setProperty('--orb-strength', String(strength('home')));
  home.style.right = '-48px';
  home.style.bottom = '-12px';
  wrap.append(away, home);
  return wrap;
}

function card(game, favorites, showScores) {
  const show = showScores && showScore(game) && game.awayScore != null && game.homeScore != null;
  const final = isFinal(game.status);
  const live = isLive(game.status);
  const awayColor = TEAM_COLORS[game.away] || '#8e8e93';
  const homeColor = TEAM_COLORS[game.home] || '#aeaeb2';
  let winner = null;
  if (final && show && game.awayScore !== game.homeScore) {
    winner = game.awayScore > game.homeScore ? 'away' : 'home';
  }

  const box = el('article', 'sports-card' + (live ? ' is-live' : ''));
  box.append(orbLayer(awayColor, homeColor, winner));

  const body = el('div', 'card-body');
  const heading = el('div', 'card-header');
  const status = el('span', 'game-status' + (live ? ' live-text' : ''));
  if (live) status.append(el('span', 'live-dot'));
  status.append(el('span', '', isUpcoming(game.status) ? fmtTip(game.tipOffAt) : gameStatus(game)));
  heading.append(status);

  const fav = el('button', 'favorite-button' + (favorited(game, favorites) ? ' selected' : ''), favorited(game, favorites) ? '★' : '☆');
  fav.type = 'button';
  fav.setAttribute('aria-label', 'Open favorite team settings');
  fav.title = 'Favorite teams';
  fav.addEventListener('click', (event) => {
    event.stopPropagation();
    chrome.runtime.openOptionsPage();
  });
  heading.append(fav);
  body.append(heading);

  const link = el('a', 'game-link');
  link.href = `https://drbl.io/games/${encodeURIComponent(game.id)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${game.away} at ${game.home}, open on DRBL`);

  const rows = el('div', 'team-rows');
  const away = makeTeamRow(game, 'away', show, show && game.awayScore > game.homeScore, final);
  const home = makeTeamRow(game, 'home', show, show && game.homeScore > game.awayScore, final);
  rows.append(away.avatar, away.identity, away.scoreCell, home.avatar, home.identity, home.scoreCell);
  link.append(rows);
  body.append(link);

  if (game.type !== 'regular') {
    body.append(
      el(
        'div',
        'type-label',
        game.type === 'play-in' ? 'Play-In' : game.type === 'playoff' ? 'Playoffs' : 'Preseason'
      )
    );
  }

  box.append(body);
  return box;
}

function visibleGames(games) {
  if (currentFilter === 'favorites') return games.filter((game) => favorited(game, snapshot.favorites));
  if (currentFilter === 'live') return games.filter((game) => isLive(game.status));
  return games;
}

function renderSection(id, listId, games, favorites, showScores) {
  const section = $(id);
  section.hidden = !games.length;
  const parent = $(listId);
  parent.replaceChildren(...games.map((g) => card(g, favorites, showScores)));
}

function render() {
  applyTheme(snapshot.theme);
  const all = snapshot.games || [];
  const selected = visibleGames(all);
  const live = selected.filter((game) => isLive(game.status));
  const todayString = nbaDateNow(new Date());
  const today = selected.filter((game) => !isLive(game.status) && game.gameDate === todayString);
  const upcoming = selected
    .filter((game) => !isLive(game.status) && isUpcoming(game.status) && game.gameDate !== todayString)
    .sort((a, b) => (a.tipOffAt || '').localeCompare(b.tipOffAt || ''))
    .slice(0, 6);
  const other = selected.filter(
    (game) => !live.includes(game) && !today.includes(game) && !upcoming.includes(game) && !isUpcoming(game.status)
  );
  const todayShown = [...today, ...other].sort((a, b) => (a.tipOffAt || '').localeCompare(b.tipOffAt || ''));

  renderSection('live-section', 'live-games', live, snapshot.favorites, snapshot.showScores !== false);
  renderSection('today-section', 'today-games', todayShown, snapshot.favorites, snapshot.showScores !== false);
  renderSection('upcoming-section', 'upcoming-games', upcoming, snapshot.favorites, snapshot.showScores !== false);

  $('live-count').textContent = String(all.filter((g) => isLive(g.status)).length);
  $('live-meta').textContent = `${live.length} game${live.length !== 1 ? 's' : ''}`;
  $('today-meta').textContent = `${todayShown.length} game${todayShown.length !== 1 ? 's' : ''}`;
  $('upcoming-meta').textContent = upcoming.length ? dateLabel(upcoming[0].tipOffAt, upcoming[0].gameDate) : '';
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
    ...(await chrome.storage.local.get(['games', 'updatedAt', 'error', 'isStale', 'favorites', 'theme', 'showScores'])),
  };
  render();
}

document.querySelectorAll('.filter').forEach((button) =>
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    render();
  })
);

$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'refresh' });
  } finally {
    $('refresh').disabled = false;
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
