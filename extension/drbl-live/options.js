'use strict';
const picks=new Set();
const picker=document.getElementById('team-picker');
function paint(){document.documentElement.dataset.theme=document.getElementById('theme').value;for(const button of picker.children)button.setAttribute('aria-pressed',String(picks.has(button.dataset.team)));}
for(const team of DRBL.TEAM_ABBRS){const button=document.createElement('button');button.type='button';button.className='team-choice';button.textContent=team;button.dataset.team=team;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{picks.has(team)?picks.delete(team):picks.add(team);paint();});picker.append(button);}
(async()=>{const settings=await chrome.storage.local.get({favorites:[],notify:true,showScores:true,theme:'system'});for(const team of settings.favorites)if(DRBL.TEAM_ABBRS.includes(team))picks.add(team);document.getElementById('notify').checked=settings.notify!==false;document.getElementById('showScores').checked=settings.showScores!==false;document.getElementById('theme').value=settings.theme||'system';paint();})();
document.getElementById('theme').addEventListener('change',paint);
document.getElementById('save').addEventListener('click',async()=>{await chrome.storage.local.set({favorites:[...picks],notify:document.getElementById('notify').checked,showScores:document.getElementById('showScores').checked,theme:document.getElementById('theme').value});document.getElementById('message').textContent='Preferences saved.';chrome.runtime.sendMessage({type:'refresh'}).catch(()=>{});});
