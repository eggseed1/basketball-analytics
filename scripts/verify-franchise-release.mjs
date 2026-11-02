import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { createGeneratedLeague } from "../src/gm/seed/create-league.ts";
import { prepareFranchise, exportFranchise } from "../src/gm/engine/franchise.ts";
import { BADGES, badgeCap, badgeEarned } from "../src/gm/engine/badges.ts";

const base = process.env.DRBL_VERIFY_BASE_URL ?? "https://basketball-analytics.drbl-analytics.workers.dev";
const dir = "/tmp/franchise-live";
mkdirSync(dir,{recursive:true});
const fixture = prepareFranchise(createGeneratedLeague({userTeamId:"bos",season:2028,seed:23}));
fixture.franchise.pauses = {offers:false,scouting:false,injuries:false};
fixture.settings.injuryFrequency = 0;
const roster = fixture.players.filter(p=>p.teamId===fixture.userTeamId&&p.contract);
const pupil = roster.find(p=>BADGES.some(b=>badgeCap(p,b.id)>badgeEarned(p,b.id)));
assert.ok(pupil);
const focus = BADGES.find(b=>badgeCap(pupil,b.id)>badgeEarned(pupil,b.id));
const browser = await chromium.launch({headless:true});
const report = {base,sourceRevision:process.env.GITHUB_SHA,widths:[],errors:[]};
try {
  for(const width of [390,1440]){
    const page = await browser.newPage({viewport:{width,height:900}});
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    const response=await page.goto(base+"/gm",{waitUntil:"domcontentloaded",timeout:120000});
    assert.equal(response?.ok(),true,"production Franchise Lab responds");
    await page.getByLabel("Import a franchise save",{exact:true}).setInputFiles({name:"release-check.json",mimeType:"application/json",buffer:Buffer.from(exportFranchise(fixture))});
    await page.getByRole("link",{name:"Development",exact:true}).first().waitFor({timeout:90000});
    assert.equal(await page.locator(".gm-desk-nav__primary > a").first().getAttribute("href"),"/gm");
    await page.goto(base+"/gm/lineup",{waitUntil:"domcontentloaded",timeout:120000});
    await page.getByRole("heading",{name:"Tonight's rotation",exact:true}).waitFor();
    assert.equal(await page.locator(".gm-rot__mins .gm-chart__cell.is-on").count(),120,"live rotation chart covers exactly 240 minutes");
    for(const row of await page.locator(".gm-pos-mins__row").all()){
      const values=await row.locator(".tabular-nums").allTextContents();
      assert.equal(values.reduce((n,v)=>n+Number(v),0),48,"live position totals cover each seat once");
    }
    const oldClosingPG=await page.getByLabel("Closing PG",{exact:true}).inputValue();
    const newClosingPG=await page.getByLabel("Closing SG",{exact:true}).inputValue();
    await page.getByLabel("Closing PG",{exact:true}).selectOption(newClosingPG);
    await page.reload({waitUntil:"domcontentloaded"});
    assert.equal(await page.getByLabel("Closing PG",{exact:true}).inputValue(),newClosingPG);
    assert.equal(await page.getByLabel("Closing SG",{exact:true}).inputValue(),oldClosingPG,"closing choices swap rather than duplicate a player");
    // Entry motion intentionally holds offscreen sections. Inspect actual
    // scrolling before capturing a full-page image, which does not scroll.
    const visualTargets = [
      ["navigation", ".gm-desk-nav"],
      ["positions", ".gm-pos-mins"],
      ["first-chart", ".gm-rot__mins .gm-chart"],
    ];
    for(const [label,selector] of visualTargets){
      const target=page.locator(selector).first();
      await target.scrollIntoViewIfNeeded();
      await page.waitForFunction(selector=>{
        let node=document.querySelector(selector);
        if(!node||!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;
        while(node){
          if(Number(getComputedStyle(node).opacity)<0.99)return false;
          node=node.parentElement;
        }
        return true;
      },selector,{timeout:15000});
      await page.screenshot({path:`${dir}/rotation-${label}-${width}.png`});
    }
    const scrollHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
    for(let y=0;y<scrollHeight;y+=600){
      await page.evaluate(y=>window.scrollTo(0,y),y);
      await page.waitForTimeout(650);
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForTimeout(650);
    await page.screenshot({path:`${dir}/rotation-${width}.png`,fullPage:true});
    await page.goto(base+"/gm/development",{waitUntil:"domcontentloaded",timeout:120000});
    await page.getByRole("heading",{name:"Development",exact:true}).waitFor();
    await page.getByLabel("Badge player",{exact:true}).selectOption(pupil.id);
    const emphasis=page.getByLabel(`Badge emphasis for ${pupil.name}`,{exact:true});
    await emphasis.selectOption(focus.id);
    assert.equal(await page.getByTestId("badge-board").locator("article").count(),10);
    await page.screenshot({path:`${dir}/badges-${width}.png`,fullPage:true});
    await page.reload({waitUntil:"domcontentloaded"});
    await page.getByLabel("Badge player",{exact:true}).selectOption(pupil.id);
    assert.equal(await emphasis.inputValue(),focus.id,"badge emphasis survives production reload");
    await page.getByRole("link",{name:`Open ${pupil.name}'s player card`,exact:true}).click();
    await page.waitForURL(`**/gm/player/${pupil.id}`);
    await page.getByLabel(`Skill badges for ${pupil.name}`,{exact:true}).waitFor();
    await page.goto(base+"/gm",{waitUntil:"domcontentloaded",timeout:120000});
    const calendar=page.locator(".gm-cal").first();
    await calendar.waitFor();
    async function cursor(){
      const month=await calendar.locator(".gm-cal__title").innerText();
      const day=await calendar.locator(".is-today .gm-cal__num").innerText();
      const value=Date.parse(`${month} ${day.trim().split(/\s/)[0]}`);
      assert.ok(Number.isFinite(value),"calendar displays a valid date");
      return value;
    }
    let previous=await cursor();
    for(let cycle=0;cycle<2;cycle++){
      await calendar.getByRole("button",{name:"Auto season",exact:true}).click();
      await page.waitForTimeout(700);
      const current=await cursor();
      assert.ok(current>=previous,"auto-sim cannot rewind the calendar");
      await calendar.getByRole("button",{name:"Stop",exact:true}).click();
      previous=await cursor();
      assert.ok(previous>=current,"stopping cannot rewind the calendar");
    }
    await page.reload({waitUntil:"domcontentloaded"});
    await calendar.waitFor();
    assert.equal(await cursor(),previous,"simulation date survives reload");
    await page.screenshot({path:`${dir}/calendar-${width}.png`,fullPage:true});
    await page.goto(base+"/gm/settings",{waitUntil:"domcontentloaded",timeout:120000});
    const pending=page.waitForEvent("download");
    await page.getByRole("button",{name:"Export this franchise",exact:true}).click();
    const download=await pending;
    const saved=JSON.parse(readFileSync(await download.path(),"utf8")).league;
    assert.ok(saved.day>fixture.day,"simulation advanced on the live client");
    const myTeam=saved.teams.find(t=>t.id===saved.userTeamId);
    assert.equal(myTeam.coaching.closingLineup[0],newClosingPG,"closing position persists through live simulation and export");
    const official=saved.boxScores.filter(box=>[box.homeTeamId,box.awayTeamId].includes(saved.userTeamId)&&box.shiftPlan?.length);
    assert.ok(official.length,"the live client played an official user-team game");
    for(const box of official){
      const side=box.homeTeamId===saved.userTeamId?"home":"away";
      for(const stint of box.stints.filter(stint=>stint.start<2880)){
        const slot=Math.floor(stint.start/120);
        const expected=box.shiftPlan.filter(row=>row.on[slot]).map(row=>row.playerId);
        assert.equal(new Set(stint[side]).size,5);
        assert.deepEqual(new Set(stint[side]),new Set(expected),"live box stints match the rotation snapshot");
      }
      for(const line of box.players)assert.equal(Object.values(line.positionMinutes??{}).reduce((n,v)=>n+v,0),line.minutes,"live position accounting matches actual player minutes");
    }

    assert.equal(saved.players.find(p=>p.id===pupil.id).badgeFocus,focus.id);
    assert.ok(saved.players.some(p=>p.badges?.gameIds?.length),"official live games persist badge progress");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),"no mobile or desktop overflow");
    assert.deepEqual(errors,[],"live client has no runtime errors");
    report.widths.push({width,day:saved.day,rotationGames:official.length,badgeCount:10,emphasis:focus.id,calendarDate:new Date(previous).toISOString(),errors});
    writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));
    await page.close();
  }
  console.log("Production Franchise Lab passed at 390px and 1440px: rotation chart and box-stint identity, positional totals, closing choices, ten badges, start/stop/resume, forward dates, reload, exports and official-game progress.");
} catch(error){
  report.errors.push(String(error));
  writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));
  throw error;
} finally {await browser.close();}
