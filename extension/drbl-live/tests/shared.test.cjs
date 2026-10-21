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
