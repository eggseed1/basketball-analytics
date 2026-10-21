'use strict';
const { TEAM_COLORS, isLive, isFinal, isUpcoming, showScore, gameStatus, favorited, nbaDateNow } = DRBL;
const $ = id => document.getElementById(id);
let currentFilter = 'all';
let snapshot = { games:[], favorites:[], updatedAt:null, isStale:false, error:null, theme:'system', showScores:true };

function el(tag, className = '', text = null) { const node = document.createElement(tag); if(className)node.className=className; if(text != null)node.textContent=String(text); return node; }
function fmtTip(tip) { if (!tip || Number.isNaN(new Date(tip).valueOf())) return 'Time TBD'; return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(tip)); }
function dateLabel(tip, gameDate) { const date = tip ? new Date(tip) : new Date(`${gameDate}T12:00:00Z`); if(Number.isNaN(date.valueOf()))return 'Upcoming'; return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',timeZone:'America/New_York'}).format(date); }
function setTheme(theme) { document.documentElement.dataset.theme = theme==='light'||theme==='dark'?theme:'system'; }
function makeTeamRow(game, side, show, leader, final) {
  const team=side==='away'?game.away:game.home;
  const row = el('div','team-row');
  const avatar=el('span','team-mark',team || '?'); avatar.style.setProperty('--team-color',TEAM_COLORS[team]||'#67748a'); avatar.setAttribute('aria-hidden','true');
  const identity=el('span','team-identity');identity.append(el('span','team-name',team || (side==='away'?'Away':'Home')));
  const rec=side==='away'?game.awayRecord:game.homeRecord;if(rec && rec!=='0-0')identity.append(el('span','record',rec));
  const score=el('span','team-score'+(show&&final&&!leader?' trailing':'')+(show&&leader?' leading':''),show?(side==='away'?game.awayScore:game.homeScore):'');
  const marker=el('span','win-marker',show&&final&&leader?'◀':'');
  row.append(avatar,identity,score,marker);return row;
}
function card(game, favorites, showScores) {
  const show=showScores && showScore(game) && game.awayScore!=null && game.homeScore!=null;
  const final=isFinal(game.status), live=isLive(game.status);
  const box=el('article','sports-card'+(live?' is-live':''));
  const heading=el('div','card-header');const status=el('span','game-status'+(live?' live-text':''));
  if(live)status.append(el('span','live-dot'));
  status.append(el('span','',isUpcoming(game.status)?fmtTip(game.tipOffAt):gameStatus(game)));
  heading.append(status);
  const fav=el('button','favorite-button'+(favorited(game,favorites)?' selected':''),favorited(game,favorites)?'★':'☆');
  fav.setAttribute('aria-label',favorited(game,favorites)?'Remove favorite teams':'Favorite teams');fav.title='Favorite teams';
  fav.addEventListener('click',event=>{event.stopPropagation();chrome.runtime.openOptionsPage();});
  heading.append(fav);box.append(heading);
  const link=el('a','game-link');link.href=`https://drbl.io/games/${encodeURIComponent(game.id)}`;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',`${game.away} at ${game.home}, open on DRBL`);
  const rows=el('div','team-rows');rows.append(makeTeamRow(game,'away',show,show&&game.awayScore>game.homeScore,final),makeTeamRow(game,'home',show,show&&game.homeScore>game.awayScore,final));link.append(rows);box.append(link);
  if(game.type!=='regular'){box.append(el('div','type-label',game.type==='play-in'?'Play-In':game.type==='playoff'?'Playoffs':'Preseason'));}
  return box;
}
function visibleGames(games) {
  if(currentFilter==='favorites')return games.filter(game=>favorited(game,snapshot.favorites));
  if(currentFilter==='live')return games.filter(game=>isLive(game.status));
  return games;
}
function renderSection(id, listId, games, favorites, showScores) {
  const section=$(id);section.hidden=!games.length;
  const parent=$(listId);parent.replaceChildren(...games.map(g=>card(g,favorites,showScores)));
}
function render() {
  setTheme(snapshot.theme);const all=snapshot.games||[];const selected=visibleGames(all);
  const live=selected.filter(game=>isLive(game.status));
  const todayString=nbaDateNow(new Date());
  const today=selected.filter(game=>!isLive(game.status)&&game.gameDate===todayString);
  const upcoming=selected.filter(game=>!isLive(game.status)&&isUpcoming(game.status)&&game.gameDate!==todayString).sort((a,b)=>(a.tipOffAt||'').localeCompare(b.tipOffAt||'')).slice(0,6);
  const other=selected.filter(game=>!live.includes(game)&&!today.includes(game)&&!upcoming.includes(game)&&!isUpcoming(game.status));
  // Non-today games in the live endpoint can include previous-day finals. Keep those accessible.
  const todayShown=[...today,...other].sort((a,b)=>(a.tipOffAt||'').localeCompare(b.tipOffAt||''));
  renderSection('live-section','live-games',live,snapshot.favorites,snapshot.showScores!==false);
  renderSection('today-section','today-games',todayShown,snapshot.favorites,snapshot.showScores!==false);
  renderSection('upcoming-section','upcoming-games',upcoming,snapshot.favorites,snapshot.showScores!==false);
  $('live-count').textContent=String(all.filter(g=>isLive(g.status)).length);
  $('live-meta').textContent=`${live.length} game${live.length!==1?'s':''}`;
  $('today-meta').textContent=`${todayShown.length} game${todayShown.length!==1?'s':''}`;
  $('upcoming-meta').textContent=upcoming.length?dateLabel(upcoming[0].tipOffAt,upcoming[0].gameDate):'';
  $('updated').textContent=snapshot.updatedAt?`Updated ${new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(snapshot.updatedAt))}`:'Waiting for first sync';
  const stale=Boolean(snapshot.isStale||snapshot.error);$('feed-indicator').classList.toggle('offline',stale);$('feed-label').textContent=stale?'Delayed':'Connected';$('feed-indicator').title=stale?'DRBL feed is unavailable or delayed':'Using DRBL live scores';
  $('feedback').hidden=!stale;$('feedback').textContent=stale?(snapshot.error || 'Some scores may be delayed.'):'';
  const empty=selected.length===0;$('empty-state').hidden=!empty;
  if(empty){$('empty-title').textContent=currentFilter==='favorites'?'No favorite games':currentFilter==='live'?'No live games right now':'No games to show';$('empty-text').textContent=currentFilter==='favorites'?'Choose teams in Settings to personalize your scores.':currentFilter==='live'?'Check back when games begin.':stale?'Scores are temporarily unavailable. Try refreshing.':'NBA games will appear here when available.';}
  document.querySelectorAll('.filter').forEach(button=>{const active=button.dataset.filter===currentFilter;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
}
async function load(){snapshot={...snapshot,...(await chrome.storage.local.get(['games','updatedAt','error','isStale','favorites','theme','showScores']))};render();}
document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{currentFilter=button.dataset.filter;render();}));
$('refresh').addEventListener('click',async()=>{$('refresh').disabled=true;try{await chrome.runtime.sendMessage({type:'refresh'});}finally{$('refresh').disabled=false;await load();}});
$('open-settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&Object.keys(changes).some(k=>['games','updatedAt','error','isStale','favorites','theme','showScores'].includes(k)))void load();});
void load().then(()=>{if(!snapshot.updatedAt || Date.now()-snapshot.updatedAt>25_000)chrome.runtime.sendMessage({type:'refresh'}).catch(()=>{});});
