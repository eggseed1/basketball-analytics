const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ctx = vm.createContext({ Intl, Date, self: {} });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../shared.js'), 'utf8'), ctx);
const lib = ctx.DRBL;
function raw(overrides={}){return {id:'401',homeTeamAbbr:'NYK',awayTeamAbbr:'BOS',homeScore:96,awayScore:92,status:'in_progress',period:4,displayClock:'4:24',gameDate:'2026-10-20',tipOffAt:'2026-10-20T23:30:00Z',...overrides};}
test('normalize uses actual DRBL GameSummary shape',()=>{const g=lib.normalizeGame(raw());assert.equal(g.home,'NYK');assert.equal(g.away,'BOS');assert.equal(g.clock,'4:24');assert.equal(g.status,'in_progress');});
test('normalizes real statuses including halftime, break and OT',()=>{assert.equal(lib.gameStatus(lib.normalizeGame(raw({status:'halftime'}))),'Halftime');assert.equal(lib.gameStatus(lib.normalizeGame(raw({status:'period_break',period:3}))),'End of Q3');assert.equal(lib.gameStatus(lib.normalizeGame(raw({period:5}))), 'OT1 · 4:24');assert.equal(lib.gameStatus(lib.normalizeGame(raw({status:'final',period:6}))),'Final · 2OT');});
test('never shows scheduled or postponed 0-0 as scores',()=>{assert.equal(lib.showScore(lib.normalizeGame(raw({status:'scheduled',awayScore:0,homeScore:0}))),false);assert.equal(lib.showScore(lib.normalizeGame(raw({status:'postponed',awayScore:0,homeScore:0}))),false);});
test('deduplicates update from live endpoint over upcoming',()=>{const upcoming=lib.normalizeFeed({data:[raw({status:'scheduled',homeScore:0,awayScore:0})]});const today=lib.normalizeFeed({data:[raw()]});const games=lib.mergeFeeds(today,upcoming);assert.equal(games.length,1);assert.equal(games[0].homeScore,96);});
test('guards malformed responses and IDs',()=>{assert.throws(()=>lib.normalizeFeed({games:[]}));assert.equal(lib.normalizeGame({id:'../evil'}),null);assert.equal(lib.normalizeGame(null),null);});
test('favorite matching',()=>{const game=lib.normalizeGame(raw());assert.equal(lib.favorited(game,['BOS']),true);assert.equal(lib.favorited(game,['DAL']),false);});
test('ESPN short codes from the scores API map to full team codes',()=>{
  const pairs={NY:'NYK',GS:'GSW',SA:'SAS',NO:'NOP',UTAH:'UTA',WSH:'WAS'};
  for(const [espn,abbr] of Object.entries(pairs)){
    const g=lib.normalizeGame(raw({homeTeamAbbr:espn,homeTeamName:'Full Name'}));
    assert.equal(g.home,abbr);
    assert.notEqual(g.homeLogo,'');
    assert.notEqual(lib.teamShortName(g.home),'');
  }
  assert.equal(lib.normalizeGame(raw({homeTeamAbbr:'NY'})).homeLogo,'https://a.espncdn.com/i/teamlogos/nba/500/ny.png');
  assert.equal(lib.favorited(lib.normalizeGame(raw({homeTeamAbbr:'NY'})),['NYK']),true);
});
test('team logos use ESPN CDN slug map',()=>{
  assert.equal(lib.teamLogoUrl('GSW',100),'https://a.espncdn.com/i/teamlogos/nba/500/gs.png');
  assert.equal(lib.teamLogoUrl('NOP'),'https://a.espncdn.com/i/teamlogos/nba/500/no.png');
  assert.equal(lib.teamLogoUrl('NYK',500),'https://a.espncdn.com/i/teamlogos/nba/500/ny.png');
  assert.equal(lib.teamLogoUrl(''),'');
});
test('nicknames and wash colors match site ScoreTile helpers',()=>{
  assert.equal(lib.teamShortName('BOS'),'Celtics');
  assert.equal(lib.teamShortName('POR'),'Trail Blazers');
  assert.equal(lib.teamWashColor('SAS'),'#8e8e93');
  assert.equal(lib.teamWashColor('BOS'),'#007A33');
});
test('favorite picker covers all 30 NBA teams',()=>{
  assert.equal(lib.TEAM_ABBRS.length,30);
  assert.ok(lib.TEAM_ABBRS.includes('OKC'));
  assert.ok(lib.TEAM_ABBRS.includes('WAS'));
  for (const abbr of lib.TEAM_ABBRS) {
    assert.ok(lib.teamLogoUrl(abbr), abbr);
    assert.ok(lib.teamShortName(abbr), abbr);
  }
});
test('headshots and box leaders',()=>{
  assert.equal(lib.espnHeadshotUrl('2544'),'https://a.espncdn.com/i/headshots/nba/players/full/2544.png');
  assert.equal(lib.espnHeadshotUrl('evil'),'');
  const leaders=lib.leadersFromBoxPlayers([
    {playerId:'1',playerName:'A Star',isHome:false,minutes:32,points:28,didNotPlay:false},
    {playerId:'2',playerName:'B Bench',isHome:false,minutes:0,points:0,didNotPlay:true},
    {playerId:'3',playerName:'C Home',isHome:true,minutes:30,points:22,didNotPlay:false},
  ],false,3);
  assert.equal(leaders.length,1);
  assert.equal(leaders[0].id,'1');
  assert.equal(leaders[0].pts,28);
  assert.equal(leaders[0].headshot,'https://a.espncdn.com/i/headshots/nba/players/full/1.png');
});
