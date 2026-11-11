#!/usr/bin/env node
// DRBL fal.ai FLUX.2 Dev controlled prompt test: 12 identities x 2 prompt treatments = 24 images.
// This is offline photographic research only. Never add generated images to production automatically.
import fs from "node:fs/promises";
import path from "node:path";
const OUTPUT=path.resolve("fal-dev-portrait-validation-04");
const ENDPOINT="https://fal.run/fal-ai/flux-2";
const PEOPLE=[
  [
    "01",
    "Black",
    "dark umber skin, broad square jaw, wide-spaced eyes, nose with rounded tip, cropped low fade, strong natural brow ridge, slight asymmetric left eyebrow"
  ],
  [
    "02",
    "white European",
    "pale skin with scattered freckles, narrow oval face, long slightly hooked nose, gray eyes, medium-length straight sandy hair, sparse chin stubble"
  ],
  [
    "03",
    "East Asian",
    "light golden skin, prominent cheeks, oval face and small chin, straight black layered hair, slightly hooded eyes, visible single small mole beneath right eye"
  ],
  [
    "04",
    "Latino",
    "medium olive skin, wide jaw and prominent brow, close black curls, broad straight nose bridge, deep-set eyes, uneven short moustache"
  ],
  [
    "05",
    "Black",
    "very deep brown skin, tall narrow face, flat wide nose, distinctive big ears, shaved scalp, clean-shaven, a small brow scar"
  ],
  [
    "06",
    "South Asian",
    "warm medium brown complexion, diamond-shaped face, sharp nose bridge, thick wavy dark hair swept back, fine mustache, slight smile lines"
  ],
  [
    "07",
    "mixed-race Black/white",
    "medium light brown skin, round cheeks, long coil twists tied behind head, short beard, broad nose, faint acne marks along cheeks"
  ],
  [
    "08",
    "white",
    "fair pinkish skin, large wide nose, round jaw, very short red buzz cut, green eyes, visible freckles across upper cheeks"
  ],
  [
    "09",
    "Black",
    "dark brown skin, high cheekbones, narrow pointed chin, shoulder-length thin braids, thick eyebrows, tiny mole on forehead, sparse beard"
  ],
  [
    "10",
    "Southeast Asian",
    "warm tan skin, compact square face, short dense straight dark hair with widow's peak, broad cheekbones, short sparse goatee"
  ],
  [
    "11",
    "Middle Eastern",
    "olive tan skin, angular long face, heavy natural brows, slightly crooked long nose, short thick dark curls, close-cut beard"
  ],
  [
    "12",
    "Black",
    "rich medium brown skin, rounded soft jaw, short high-top natural hair, straight eyebrows, slightly crooked nose tip, clean-shaven"
  ]
];
const BASE="One authentic unretouched official NBA-style basketball team media-day roster photograph of an entirely FICTIONAL adult male athlete, not a real player or celebrity. Age 19 to 26. Facing camera directly, eye-level 85mm lens perspective, eyes looking into lens, mouth closed, calm neutral expression, head vertical, both shoulders level and squared to camera, natural athletic body proportions. Head-and-upper-chest square photo: whole hair, ears, shoulder tips and neck visible, hair begins roughly 7 percent below top edge, eyes around 42 percent down, chest enters bottom 25 percent. Even pale light gray (#d6d8da) paper sweep backdrop with no objects, no vignette, no gradient. Plain dark midnight navy perforated mesh basketball practice jersey, realistic wide sleeveless basketball armholes, white neck and shoulder piping, naturally folded fabric, no text, no numbers, no logo or patch. Unambiguously true DSLR sports team portrait, accurate face and head anatomy, sharp eyes, organic shadows, neutral white balance, subtle individual human asymmetry. No digital illustration, CGI, anime, fake leather skin, glamour retouching, exaggerated muscles, blinding shine, head tilt, props, watermark or text.";
const VARIANTS=[
 ["baseline","Realistic media-day identification photograph with even diffused broad frontal light; natural skin texture and faint human blemishes without exaggeration."],
 ["candid","Sports-team photo booth portrait captured without beauty retouching; lived-in real skin with barely visible pores, mild naturally uneven pigmentation and faint under-eye texture. Soft frontal light, reduced specular shine, documentary color, modest expression; ordinary real human facial proportions rather than idealized symmetrical beauty."],
];
const jobs=PEOPLE.flatMap(([id,group,details],i)=>VARIANTS.map(([style,extra],j)=>({id:id+"-"+style,person:id,style,seed:213000+i*991, prompt:"A distinct "+group+" male professional basketball prospect with "+details+". "+extra+" "+BASE})));
if(PEOPLE.length!==12||jobs.length!==24||new Set(PEOPLE.map(p=>p[0])).size!==12)throw Error("Test hard capped to 24 images");
if(!process.argv.includes("--execute")){console.log(JSON.stringify({images:24,endpoint:ENDPOINT,size:"960x960",estimatedCostUSD:0.288,profiles:PEOPLE.map(x=>x[0])},null,2));process.exit(0);}
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.FAL_KEY)throw Error("GitHub secret FAL_KEY required");
await fs.mkdir(OUTPUT,{recursive:true});
const manifest={model:"fal-ai/flux-2",size:[960,960],iteration:4,estimatedModelCostUSD:0.288,images:[],failures:[]};
for(const [index,job] of jobs.entries()){
  const res=await fetch(ENDPOINT,{method:"POST",headers:{Authorization:"Key "+process.env.FAL_KEY,"Content-Type":"application/json"},body:JSON.stringify({prompt:job.prompt,image_size:{width:960,height:960},num_images:1,seed:job.seed,output_format:"jpeg",enable_safety_checker:true}),signal:AbortSignal.timeout(180000)});
  if(!res.ok){manifest.failures.push({id:job.id,status:res.status});console.log("Failed "+job.id+": "+res.status);continue;}
  const data=await res.json(),info=data.images?.[0];
  if(!info?.url){manifest.failures.push({id:job.id,status:"no-image"});continue;}
  const url=new URL(info.url);if(url.protocol!=="https:"||!url.hostname.endsWith(".fal.media"))throw Error("Unexpected download host");
  const img=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!img.ok)throw Error("Image download HTTP "+img.status);
  const bytes=Buffer.from(await img.arrayBuffer());if(bytes.length<10000||bytes.length>15000000)throw Error("Image size invalid");
  const file=job.id+".jpg";await fs.writeFile(path.join(OUTPUT,file),bytes);
  manifest.images.push({...job,file,width:info.width,height:info.height,bytes:bytes.length});
  await fs.writeFile(path.join(OUTPUT,"manifest.json"),JSON.stringify(manifest,null,2));
  console.log("Generated "+manifest.images.length+"/24 "+job.id+" (#"+(index+1)+")");
}
const elements=manifest.images.map(img=>`<figure><img loading="lazy" src="${img.file}"><figcaption>${img.person} — ${img.style}</figcaption></figure>`).join("\n");
const html=`<!doctype html><html><head><meta charset="utf-8"><title>DRBL Portrait Validation 04</title><style>body{margin:24px;background:#101724;color:white;font:15px system-ui}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}figure{margin:0;background:#273241;border-radius:9px;overflow:hidden}img{display:block;width:100%}figcaption{padding:10px}@media(max-width:750px){main{grid-template-columns:repeat(2,1fr)}}</style></head><body><h1>DRBL FLUX.2 Dev / 12 identities, 2 treatments</h1><p>Compare pairs for natural skin and consistent team-photo crop.</p><main>${elements}</main></body></html>`;
await fs.writeFile(path.join(OUTPUT,"review.html"),html);
console.log("Complete. "+manifest.images.length+" portraits; "+manifest.failures.length+" failed.");
