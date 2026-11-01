import assert from "node:assert/strict";
import {mkdirSync,readFileSync,writeFileSync,createWriteStream} from "node:fs";
import {spawn,spawnSync} from "node:child_process";
import {chromium} from "playwright";
const dir="/tmp/franchise-draft-qa";mkdirSync(dir,{recursive:true});
const fixture=spawnSync(process.execPath,["--import","tsx","--require","./scripts/lib/stub-server-only.cjs","scripts/fixture-gm-draft-overhaul.ts",dir],{encoding:"utf8"});assert.equal(fixture.status,0,fixture.stderr);
const manifest=JSON.parse(readFileSync(dir+"/manifest.json","utf8")),errors=[],report={screens:[],tasks:[],revision:process.env.GITHUB_SHA};
const log=createWriteStream(dir+"/next.log"),server=spawn("npm",["run","dev","--","--hostname","127.0.0.1"],{detached:true,stdio:["ignore","pipe","pipe"],env:{...process.env,PORT:"3109",NEXT_TELEMETRY_DISABLED:"1"}});server.stdout.pipe(log);server.stderr.pipe(log);
let browser,page,imported=false;
try{
  let ready=false;for(let index=0;index<100;index++){try{if((await fetch("http://127.0.0.1:3109/gm")).ok){ready=true;break;}}catch{ /* Next is still starting. */ }await new Promise(resolve=>setTimeout(resolve,1500));}assert.ok(ready,"draft browser server did not start");
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:390,height:844}});page.on("pageerror",error=>errors.push(error.message));await page.emulateMedia({reducedMotion:"reduce"});
  async function load(name){
    await page.goto("http://127.0.0.1:3109/gm"+(imported?"/franchise":""),{waitUntil:"domcontentloaded",timeout:120000});
    if(imported)await page.getByRole("button",{name:"Settings and saves",exact:true}).click();
    await page.getByLabel("Import a franchise save",{exact:true}).setInputFiles(dir+"/"+name+".json");
    if(imported)await page.getByText("Franchise opened in a new save slot.",{exact:true}).waitFor();else await page.getByRole("button",{name:"My teams and saved franchises",exact:true}).waitFor({timeout:90000});
    imported=true;await page.goto("http://127.0.0.1:3109/gm/draft",{waitUntil:"domcontentloaded",timeout:120000});
  }
  async function exported(){
    await page.goto("http://127.0.0.1:3109/gm/franchise",{waitUntil:"domcontentloaded",timeout:120000});await page.getByRole("button",{name:"Settings and saves",exact:true}).click();const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Export this franchise",exact:true}).click();const file=await pending;const state=JSON.parse(readFileSync(await file.path(),"utf8")).league;await page.goto("http://127.0.0.1:3109/gm/draft",{waitUntil:"domcontentloaded",timeout:120000});return state;
  }
  async function capture(name){
    await page.evaluate(()=>scrollTo(0,0));const width=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));assert.ok(width.content<=width.viewport+2,name+" overflows");await page.screenshot({path:dir+"/"+name+".png",fullPage:true,animations:"disabled"});writeFileSync(dir+"/"+name+".html",await page.content());report.screens.push({name,...width});
  }
  await load("prep");await page.getByTestId("draft-war-room").waitFor();await capture("mobile-draft-preparation");
  await page.getByLabel("Draft strategy",{exact:true}).selectOption("shooting");
  await page.getByRole("button",{name:"Open report for "+manifest.targetName,exact:true}).click();
  await page.getByLabel("Scouting skill focus",{exact:true}).selectOption("shooting");
  await page.getByRole("button",{name:"Watch film for "+manifest.targetName,exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"Watch film for "+manifest.targetName,exact:true}).isDisabled(),true);
  await page.getByRole("button",{name:"Analytics review for "+manifest.targetName,exact:true}).click();
  await page.getByRole("button",{name:"Private workout for "+manifest.targetName,exact:true}).click();
  await page.getByRole("button",{name:"Add to watchlist",exact:true}).click();await capture("mobile-prospect-research");
  let saved=await exported();assert.equal(saved.draftScouting.spent,4);assert.equal(saved.draftScouting.strategy,"shooting");assert.ok(saved.draftScouting.watchlist.includes(manifest.targetId));
  await page.getByRole("button",{name:"Open report for "+manifest.targetName,exact:true}).click();assert.equal(await page.getByRole("button",{name:"Watch film for "+manifest.targetName,exact:true}).isDisabled(),true);
  await page.goto("http://127.0.0.1:3109/gm/player/"+encodeURIComponent(manifest.targetId),{waitUntil:"domcontentloaded"});await page.getByRole("region",{name:"Prospect file for "+manifest.targetName,exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Watch film for "+manifest.targetName,exact:true}).isDisabled(),true);await page.getByRole("link",{name:"Back to draft board",exact:true}).click();
  const compare=page.getByRole("button",{name:/^Compare /});await compare.nth(0).click();await compare.nth(1).click();await page.getByRole("region",{name:"Prospect comparison",exact:true}).waitFor();await capture("mobile-prospect-comparison");report.tasks.push("Research, budget, watchlist, distinct strategy, comparison and reload");
  await load("night");await page.getByRole("heading",{name:"Draft night",exact:true}).waitFor();await page.getByRole("button",{name:"Trade picks",exact:true}).click();
  await page.getByLabel("Target draft pick",{exact:true}).selectOption(String(manifest.tradeSlot));await page.getByRole("button",{name:"Suggest a package",exact:true}).click();
  await page.getByRole("button",{name:"Review draft trade",exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Review draft trade",exact:true}).isDisabled(),false);await capture("mobile-draft-trade");
  await page.getByRole("button",{name:"Review draft trade",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click();saved=await exported();assert.equal(saved.draftDeals?.length??0,0);
  await page.getByRole("button",{name:"Trade picks",exact:true}).click();await page.getByLabel("Target draft pick",{exact:true}).selectOption(String(manifest.tradeSlot));await page.getByRole("button",{name:"Suggest a package",exact:true}).click();await page.getByRole("button",{name:"Review draft trade",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Confirm draft trade",exact:true}).click();
  saved=await exported();assert.equal(saved.draftOrder[manifest.tradeSlot],"bos");assert.equal(saved.draftPickIndex,12);assert.equal(saved.draftDeals.length,1);
  await page.getByRole("button",{name:"Sim to my pick",exact:true}).click();await page.getByRole("heading",{name:"You are on the clock",exact:true}).waitFor();
  await page.getByRole("button",{name:"Open report for "+manifest.targetName,exact:true}).click();await page.getByRole("button",{name:"Draft "+manifest.targetName,exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Submit draft pick",exact:true}).click();
  saved=await exported();assert.equal(saved.players.find(player=>player.id===manifest.targetId).teamId,"bos");assert.equal(saved.draftPickIndex,manifest.tradeSlot+1,"the next CPU pick waits");report.tasks.push("Trade up, cancellation, confirmation, pick ownership, draft selection and manual pacing");
  await load("results");await page.getByRole("heading",{name:/You took/}).waitFor();const plan=page.getByRole("combobox",{name:/Development plan for/}).first();await plan.selectOption("practice");saved=await exported();assert.ok(saved.players.some(player=>player.teamId==="bos"&&player.developmentPlan==="practice"));await capture("mobile-draft-results");
  await page.setViewportSize({width:1440,height:1000});await load("prep");await page.getByTestId("draft-war-room").waitFor();await capture("desktop-draft-preparation");await load("night");await page.getByRole("button",{name:"Trade picks",exact:true}).click();await capture("desktop-draft-trade");report.tasks.push("Development plans, desktop and mobile layouts");
  assert.deepEqual(errors,[]);console.log("Draft browser checks passed across "+report.screens.length+" screens: research, comparison, reloads, trade up, confirmation, picks and development plans.");
}catch(error){report.error=error.stack??String(error);if(page){await page.screenshot({path:dir+"/failure.png",fullPage:true});writeFileSync(dir+"/failure.html",await page.content());}throw error;}
finally{writeFileSync(dir+"/report.json",JSON.stringify({...report,errors},null,2));await browser?.close();try{process.kill(-server.pid,"SIGTERM");}catch{ /* Server already stopped. */ }log.end();}
