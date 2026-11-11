#!/usr/bin/env node
// DRBL final prompt-validation sample: 6 new fictional players, one FLUX.2 Dev output per person.
// Purpose: assess transfer to unseen identities and consistent player-card photo framing.
import fs from "node:fs/promises";
import path from "node:path";
const endpoint="fal-ai/flux-2", output=path.resolve("portrait-photo-iteration-03");
const people=[
 ["G","20-year-old Black male basketball prospect with very deep brown skin, lean triangular face, broad cheekbones, flat rounded nose, short thick loc twists, slightly uneven front teeth not visible, and clean-shaven cheeks"],
 ["H","25-year-old white European male professional forward with fair freckled skin, sandy blond short curly hair, narrow angular face, blue-gray eyes, asymmetric thick eyebrows, long narrow nose and a close-cut reddish beard"],
 ["I","23-year-old East Asian male basketball guard with light tan skin, strong square jaw, prominent cheekbones, short dark side-swept textured hair, no facial hair, and a subtle visible old scar just above one eyebrow"],
 ["J","21-year-old Latino male basketball wing with warm olive-brown skin, a broad rounded nose, large slightly hooded eyes, tight black buzz cut, high rounded cheeks, very faint mustache and a small mole under his right eye"],
 ["K","24-year-old Black male basketball center with dark skin, long lean oval face, slightly large ears, thick natural high-top fade, strong wide nose, minimal facial hair, and distinctly asymmetric brow shape"],
 ["L","22-year-old South Asian male basketball forward with rich medium-brown skin, almond eyes, dense low dark curls, broad nose bridge, rounded jaw, thin neat mustache and faint facial acne marks"]
];
const anchor="Unretouched authentic professional basketball media-day player roster photograph. ONE fictional real adult male athlete, not a celebrity, not an existing NBA player, natural imperfect human facial proportions. Directly face-on camera at eye level, neutral slightly stern expression, lips fully closed, both eyes looking at the viewer. Both shoulders level and square to the photographer, no turning, no head tilt. Tight upper-torso portrait with face and hair approximately half the image height, entire hair and both shoulder tips visible, 7 percent empty space above hairstyle, head centered. Plain dark midnight-navy perforated mesh basketball jersey with bright white fabric piping around neck and shoulders; actual athletic jersey construction, NO logos, trademarks, text, numbers or patches. Neutral pale gray seamless studio background with absolutely no objects or gradient. Soft broad frontal lighting, neutral white balance, real photographic natural skin texture and faint imperfections without exaggeration, sharp focus on real-looking eyes, no plastic or wet skin. 85mm sports roster portrait, natural shallow depth but background remains uniform. No CGI, illustration, beauty-filter skin, glamour, dramatic color grade, heavy shadow, artificial hyperreal pores, tattoos, props or captions. Keep clothing, backdrop, camera distance, exposure and light consistent with an official team roster photo archive.";
if(people.length!==6||new Set(people.map(x=>x[0])).size!==6)throw Error("Exactly 6 distinct profiles required");
if(!process.argv.includes("--execute")){console.log(JSON.stringify({model:endpoint,images:people.length,estimatedCostUSD:0.072,identities:people.map(x=>x[0])},null,2));process.exit(0);}
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.FAL_KEY)throw Error("Missing FAL_KEY");
await fs.mkdir(output,{recursive:true});
const manifest={model:endpoint,iteration:3,estimatedCostUSD:0.072,images:[],failures:[]};
for(const [i,[id,identity]] of people.entries()){
 const prompt="Subject: "+identity+". "+anchor;
 const res=await fetch("https://fal.run/"+endpoint,{method:"POST",headers:{"Authorization":"Key "+process.env.FAL_KEY,"Content-Type":"application/json"},body:JSON.stringify({prompt,image_size:{width:960,height:960},num_images:1,seed:991200+i*977,output_format:"jpeg",enable_safety_checker:true}),signal:AbortSignal.timeout(190000)});
 if(!res.ok){manifest.failures.push({id,status:res.status});console.log("Generation failed for "+id+" HTTP "+res.status);continue;}
 const data=await res.json(),info=data.images?.[0];
 if(!info?.url){manifest.failures.push({id,status:"missing-image"});continue;}
 const url=new URL(info.url);if(url.protocol!=="https:"||!url.hostname.endsWith(".fal.media"))throw Error("Untrusted host");
 const img=await fetch(url,{signal:AbortSignal.timeout(65000)});if(!img.ok)throw Error("Download failed");
 const bytes=Buffer.from(await img.arrayBuffer());if(bytes.length<10000||bytes.length>15000000)throw Error("Bad image size");
 await fs.writeFile(path.join(output,id+".jpg"),bytes);
 manifest.images.push({id,description:identity,file:id+".jpg",prompt,seed:data.seed??991200+i*977});
 await fs.writeFile(path.join(output,"manifest.json"),JSON.stringify(manifest,null,2));
 console.log("Saved "+manifest.images.length+" out of "+people.length+": "+id);
}
const html='<!doctype html><html><head><meta charset="utf-8"><title>DRBL final prompt candidates</title><style>body{background:#101827;color:white;font:15px system-ui;padding:24px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}figure{margin:0;background:#273346;border-radius:12px;overflow:hidden}img{display:block;width:100%}figcaption{padding:12px}</style></head><body><h1>DRBL / six independent player portrait candidates</h1><main>'+manifest.images.map(x=>'<figure><img src="'+x.file+'"><figcaption>'+x.id+'</figcaption></figure>').join("")+'</main></body></html>';
await fs.writeFile(path.join(output,"review.html"),html);
console.log("Complete with "+manifest.images.length+" images.");
