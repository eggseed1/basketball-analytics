#!/usr/bin/env node
// One-time, non-billable OpenAI organization diagnostic. Never prints IDs or key to logs.
import fs from "node:fs/promises";
import path from "node:path";
if (process.env.GITHUB_ACTIONS !== "true" || !process.env.OPENAI_API_KEY) throw Error("Run via GitHub Actions with OPENAI_API_KEY");
const res=await fetch("https://api.openai.com/v1/me",{headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY},signal:AbortSignal.timeout(25000)});
if(!res.ok) throw Error("OpenAI /v1/me failed: HTTP "+res.status);
const data=await res.json();
const raw=Array.isArray(data.orgs)?data.orgs:Array.isArray(data.orgs?.data)?data.orgs.data:[];
const orgs=raw.map(x=>({id:typeof x.id==="string"?x.id:null,title:typeof x.title==="string"?x.title:null})).filter(x=>x.id&&x.id.startsWith("org-"));
const out=path.resolve("private-org-diagnostic");
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,"organization-ids.json"),JSON.stringify({organization_count:orgs.length,organizations:orgs,note:"Returned by authenticated /v1/me using the GitHub OPENAI_API_KEY secret. Compare each ID with the billing organization. This does not expose balances or prove which organization is funded."},null,2));
console.log("API account lookup succeeded. Number of organizations: "+orgs.length+". Organization IDs and titles stored in private Actions artifact, never printed to logs.");
if(!orgs.length) console.log("No organization IDs in /v1/me response; organization records may be unavailable to this key.");
