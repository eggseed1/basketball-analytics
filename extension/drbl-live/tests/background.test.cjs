const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const shared = fs.readFileSync(path.join(__dirname, '../shared.js'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
function harness(initial, feeds) {
  const store = {...initial};
  const notifications=[];
  const listeners = {};
  let badge='';
  const chrome = {
    storage: { local: {
      get:async defaults => typeof defaults === 'object'?{...defaults,...store}:store,
      set:async state => Object.assign(store,state),
    } },
    notifications: { create:async (id,opts)=>{ notifications.push({id,...opts}); } },
    action: { setBadgeText:async x=>{badge=x.text;},setBadgeBackgroundColor:async()=>{},setBadgeTextColor:async()=>{} },
    alarms: {create:()=>{},onAlarm:{addListener:f=>listeners.alarm=f}},
    runtime:{onInstalled:{addListener:f=>listeners.installed=f},onStartup:{addListener:f=>listeners.startup=f},onMessage:{addListener:f=>listeners.message=f}},
  };
  const ctx=vm.createContext({chrome,console,Promise,Set,Map,Intl,Date, self:{}, fetch:async url=>{
    const payload = url.includes('/api/scores/live')?feeds.live:feeds.upcoming;
    if(payload instanceof Error) throw payload;
    return {ok:true,json:async()=>payload};
  }});
  vm.runInContext(shared,ctx);
  ctx.importScripts = () => {};
  vm.runInContext(worker,ctx);
  return {store,notifications,listeners,getBadge:()=>badge};
}
const live=(status='in_progress')=>({id:'g1',homeTeamAbbr:'NYK',awayTeamAbbr:'BOS',homeScore:102,awayScore:99,status,gameDate:'2026-10-20'});
test('worker reuses /api/scores/live and /api/scores/upcoming and badges games',async()=>{
  const app=harness({}, {live:{data:[live()]}, upcoming:{data:[]}});
  await app.listeners.message({type:'refresh'},null,()=>{});
  await new Promise(r=>setImmediate(r));
  assert.equal(app.store.games.length,1);assert.equal(app.getBadge(),'1');assert.equal(app.notifications.length,0);
});
test('first sync final does not notify favorite',async()=>{
  const app=harness({favorites:['BOS']},{live:{data:[live('final')]},upcoming:{data:[]}});
  await app.listeners.message({type:'refresh'},null,()=>{});
  await new Promise(r=>setImmediate(r));assert.equal(app.notifications.length,0);
});
test('favorite live-to-final transition notifies exactly once and honors score mask',async()=>{
  const old={...live('in_progress'),away:'BOS',home:'NYK',awayScore:99,homeScore:102};
  const app=harness({favorites:['BOS'],showScores:false,games:[old]}, {live:{data:[live('final')]},upcoming:{data:[]}});
  await app.listeners.message({type:'refresh'},null,()=>{});
  await new Promise(r=>setImmediate(r));
  assert.equal(app.notifications.length,1);assert.match(app.notifications[0].message,/has finished/);assert.doesNotMatch(app.notifications[0].message,/102/);
  await app.listeners.message({type:'refresh'},null,()=>{});
  await new Promise(r=>setImmediate(r));assert.equal(app.notifications.length,1);
});
test('network failure preserves saved scores and marks stale',async()=>{
  const old={...live(),home:'NYK',away:'BOS'};
  const app=harness({games:[old]}, {live:new Error('offline'),upcoming:new Error('offline')});
  await app.listeners.message({type:'refresh'},null,()=>{});
  await new Promise(r=>setImmediate(r));assert.equal(app.store.games.length,1);assert.equal(app.store.isStale,true);
});
