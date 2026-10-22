'use strict';

const picks = new Set();
const picker = document.getElementById('team-picker');
const themeSelect = document.getElementById('theme');

function applyTheme(theme) {
  const root = document.documentElement;
  const mode = theme === 'light' || theme === 'dark' ? theme : 'system';
  root.dataset.theme = mode;
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
}

function paint() {
  applyTheme(themeSelect.value);
  for (const button of picker.children) {
    button.setAttribute('aria-pressed', String(picks.has(button.dataset.team)));
  }
}

for (const team of DRBL.TEAM_ABBRS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'team-choice';
  button.textContent = team;
  button.dataset.team = team;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    if (picks.has(team)) picks.delete(team);
    else picks.add(team);
    paint();
  });
  picker.append(button);
}

(async () => {
  const settings = await chrome.storage.local.get({
    favorites: [],
    notify: true,
    showScores: true,
    theme: 'system',
  });
  for (const team of settings.favorites) {
    if (DRBL.TEAM_ABBRS.includes(team)) picks.add(team);
  }
  document.getElementById('notify').checked = settings.notify !== false;
  document.getElementById('showScores').checked = settings.showScores !== false;
  themeSelect.value = settings.theme || 'system';
  paint();
})();

themeSelect.addEventListener('change', paint);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themeSelect.value === 'system') paint();
});

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    favorites: [...picks],
    notify: document.getElementById('notify').checked,
    showScores: document.getElementById('showScores').checked,
    theme: themeSelect.value,
  });
  document.getElementById('message').textContent = 'Saved.';
  chrome.runtime.sendMessage({ type: 'refresh' }).catch(() => {});
});
