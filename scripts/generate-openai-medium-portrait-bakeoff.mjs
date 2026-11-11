#!/usr/bin/env node
// DRBL 12 distinct fictional identities at GPT Image 1.5 medium quality. Manual GitHub Actions only.
import fs from "node:fs/promises";
import path from "node:path";
const MODEL="gpt-image-1.5";
const QUALITY="medium";
const SIZE="1024x1024";
const OUT=path.resolve("openai-portrait-medium-output");
const profiles=[
  [
    "01-malik",
    "20-year-old Black man with deep umber skin, a broad square face, high cheekbones, wide-set eyes, close-cropped taper fade and a subtle eyebrow scar"
  ],
  [
    "02-eli",
    "22-year-old fair-skinned white man with pale blue eyes, freckles, an angular narrow face, messy reddish-brown wavy hair and no facial hair"
  ],
  [
    "03-haru",
    "21-year-old East Asian man with a broad jaw, straight dense black hair in a textured side part, slightly hooded eyes and a faint mole beneath his left eye"
  ],
  [
    "04-andre",
    "24-year-old mixed Black and white man with warm light-brown skin, a long lean face, sharp chin, medium-length loose braids and a thin mustache"
  ],
  [
    "05-mateo",
    "23-year-old Latino man with olive-brown skin, thick straight eyebrows, a strong prominent nose, short black curls and a carefully trimmed goatee"
  ],
  [
    "06-darius",
    "19-year-old Black man with very dark skin, a rounded youthful face, compact short twists, wide nose, clean-shaven cheeks and full lips"
  ],
  [
    "07-luka",
    "25-year-old white European man with fair skin, blond buzz cut, prominent ears, a slightly crooked nose, faint stubble and a broad forehead"
  ],
  [
    "08-jin",
    "20-year-old East Asian man with light golden-beige skin, angular cheekbones, black medium-length layered hair, narrow chin and no facial hair"
  ],
  [
    "09-amir",
    "23-year-old Middle Eastern man with tan skin, thick arched eyebrows, aquiline nose, long oval face, close dark buzz cut and neatly trimmed beard"
  ],
  [
    "10-isaiah",
    "22-year-old Black man with medium-deep brown skin, round expressive eyes, oval face, shoulder-length neat locs pulled behind his ears and a thin beard"
  ],
  [
    "11-noah",
    "21-year-old white man with very fair skin, sandy curly hair, broad nose, a rounded jaw, a few acne marks and an open neutral expression"
  ],
  [
    "12-kenji",
    "24-year-old Japanese man with light-medium skin, prominent cheekbones, short straight dark hair shaved at the sides, slightly asymmetric brows and clean-shaven face"
  ]
];
if(profiles.length!==12 || new Set(profiles.map(x=>x[0])).size!==12) throw Error("Portrait batch must contain exactly twelve unique descriptions");
const common="Official professional basketball media-day photograph of ONE entirely fictional adult male professional athlete. This is a straight-on head-and-shoulders roster portrait, NOT a fashion photo or an illustration. Camera exactly at eye level; face and BOTH shoulders squared to the lens. Relaxed, slightly serious neutral expression and direct eye contact. Entire hair, both ears, both shoulders and upper chest visible; leave generous headroom and symmetrical margins. Plain deep navy sleeveless practice basketball jersey with white edge binding, without logos, lettering, numbers or emblems. Uniform neutral light-gray seamless studio background (#d7d9db), soft diffused balanced frontal studio lighting, 85mm lens perspective, lifelike photographic skin pores, fine imperfections, individual strands of hair, plausible asymmetry and natural age-appropriate features. Avoid airbrushing, plastic skin, CGI, painting, heavily sculpted beauty model faces, extra people, hands, headbands, text, watermarks, commercial brands and photography props. Use documentary sports photography; prioritize realistic human individuality over flawless symmetry.";
const jobs=profiles.map(([id,identity])=>({id,identity,prompt:`${common} The unique individual is a ${identity}. Visually distinct physical identity; do not collapse to a generic handsome player. The person is a new fictional athlete, not a celebrity or an existing NBA player.`}));
if(!process.argv.includes("--execute")){ console.log(JSON.stringify({model:MODEL,quality:QUALITY,size:SIZE,images:jobs.length,estimatedImageOutputUSD:0.408,ids:jobs.map(j=>j.id),examplePrompt:jobs[0].prompt},null,2)); process.exit(0); }
if(process.env.GITHUB_ACTIONS!=="true" || !process.env.OPENAI_API_KEY) throw Error("Requires an OpenAI API key in GitHub Actions secret OPENAI_API_KEY");
await fs.mkdir(OUT,{recursive:true});
const manifest={model:MODEL,quality:QUALITY,size:SIZE,generatedAt:new Date().toISOString(),estimatedImageOutputUSD:0.408,results:[]};
for(const job of jobs){
  const res=await fetch("https://api.openai.com/v1/images/generations",{
    method:"POST",
    headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({model:MODEL,quality:QUALITY,size:SIZE,n:1,output_format:"jpeg",output_compression:92,background:"opaque",prompt:job.prompt}),
    signal:AbortSignal.timeout(180000)
  });
  if(!res.ok) {
    // Only disclose predefined public OpenAI error codes; never echo response body,
    // API key, request headers, organization/project IDs, or free-form messages.
    let code="unknown";
    let type="unknown";
    try {
      const body=await res.json();
      const candidates=["insufficient_quota","billing_hard_limit_reached","rate_limit_exceeded","image_generation_user_error","invalid_api_key","organization_verification_required","model_not_found","model_not_supported"];
      if(candidates.includes(body?.error?.code)) code=body.error.code;
      if(candidates.includes(body?.error?.type)) type=body.error.type;
    } catch {}
    throw Error("Image generation failed at "+job.id+" (HTTP "+res.status+", error_code="+code+", error_type="+type+"). No image charged by this failed request.");
  }
  const data=await res.json();
  const b64=data?.data?.[0]?.b64_json;
  if(typeof b64!=="string" || b64.length<10000) throw Error("Missing image in API response for "+job.id);
  const bytes=Buffer.from(b64,"base64");
  if(bytes.length<10000 || bytes.length>15000000) throw Error("Unexpected image byte size");
  const file=job.id+".jpg";
  await fs.writeFile(path.join(OUT,file),bytes);
  manifest.results.push({id:job.id,description:job.identity,file,bytes:bytes.length,prompt:job.prompt});
  await fs.writeFile(path.join(OUT,"manifest.json"),JSON.stringify(manifest,null,2));
  console.log(`Portrait ${manifest.results.length}/12 saved: ${file}`);
}
const cards=manifest.results.map(x=>`<figure><img src="${x.file}" alt="${x.id}"><figcaption><b>${x.id}</b><p>${x.description}</p></figcaption></figure>`).join("\n");
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>DRBL GPT Image Medium portrait bakeoff</title><style>body{font:14px system-ui;color:#f5f7fc;background:#101723;padding:24px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}figure{margin:0;background:#1e293b;border-radius:12px;overflow:hidden}img{width:100%;display:block}figcaption{padding:10px}p{color:#b9c4d3}@media(max-width:720px){main{grid-template-columns:repeat(2,1fr)}}</style></head><body><h1>DRBL / GPT Image 1.5 Medium: twelve identities</h1><p>Individual 1024-square portraits. Evaluate realism, difference between players and consistent crop.</p><main>${cards}</main></body></html>`;
await fs.writeFile(path.join(OUT,"review.html"),html);
console.log("Done. Download the image ZIP from the workflow artifacts. The live website was not changed.");
