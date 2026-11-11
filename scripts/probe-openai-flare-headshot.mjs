#!/usr/bin/env node
// Single successful-portrait access probe. Attempts 2.6 Flare first, then 2.5 Flare only if unavailable.
import fs from "node:fs/promises";
import path from "node:path";
const models=["gpt-image-2.6-flare","gpt-image-2.5-flare"];
const output=path.resolve("openai-flare-portrait-probe");
const prompt="Professional basketball media-day portrait photograph of a SINGLE fictional 22-year-old adult athlete, not a real player or celebrity. Distinctive natural face: medium-deep brown skin, long oval face, pronounced cheekbones, slightly crooked broad nose, subtle eyebrow asymmetry, closely cropped black curls and short clean goatee. Level eye contact and symmetrical forward-facing shoulders, neutral confident expression, mouth closed. Uniform neutral soft gray studio background, balanced diffused studio softbox lighting, 85mm portrait photograph, lifelike fine pores and skin texture, subtle authentic blemishes. Plain sleeveless charcoal-gray basketball jersey, V-neck, realistically stitched mesh fabric, no teams, logos, writing or numbers. Full hair, both ears and upper chest in the 1024x1024 frame with consistent generous headroom. Avoid CGI, illustration, plastic skin, airbrushing, text, watermarks, and beauty retouching.";
const allowedCodes=new Set(["rate_limit_exceeded","insufficient_quota","billing_hard_limit_reached","model_not_found","model_not_supported","model_not_available","access_denied","organization_verification_required","invalid_request_error","invalid_api_key"]);
if(!process.argv.includes("--execute")) {console.log(JSON.stringify({models,quality:"medium",size:"1024x1024",maxSuccessfulImages:1,prompt},null,2));process.exit(0);}
if(process.env.GITHUB_ACTIONS!=="true"||!process.env.OPENAI_API_KEY)throw Error("OPENAI_API_KEY secret missing from GitHub Actions");
await fs.mkdir(output,{recursive:true});
const diagnostics=[];let successful=false;
for(const model of models){
  console.log("Testing image access: "+model);
  let response;
  try { response=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model,prompt,quality:"medium",size:"1024x1024",n:1}),signal:AbortSignal.timeout(180000)}); }
  catch(e){diagnostics.push({model,result:"network_error"});break;}
  if(!response.ok){
    let code="unspecified";
    try {const data=await response.json();if(allowedCodes.has(data?.error?.code))code=data.error.code;else if(allowedCodes.has(data?.error?.type))code=data.error.type;}catch{}
    diagnostics.push({model,result:"failed",status:response.status,error_code:code});
    console.log("Probe failed: "+model+" HTTP "+response.status+" code="+code);
    if([400,403,404,429].includes(response.status))continue;
    break;
  }
  const data=await response.json();
  const b64=data?.data?.[0]?.b64_json;
  if(typeof b64!=="string"||b64.length<10000){diagnostics.push({model,result:"unexpected_success_response"});break;}
  const buffer=Buffer.from(b64,"base64");
  if(buffer.length<10000||buffer.length>15000000){diagnostics.push({model,result:"unexpected_image_size"});break;}
  await fs.writeFile(path.join(output,"fictional-player.jpg"),buffer);
  diagnostics.push({model,result:"success",bytes:buffer.length});successful=true;
  console.log("One image generated successfully with "+model);
  break;
}
await fs.writeFile(path.join(output,"results.json"),JSON.stringify({models,quality:"medium",size:"1024x1024",atMostOneGeneratedImage:true,prompt,diagnostics},null,2));
if(!successful){console.log("No image generation model available in this probe. Check results.json for safe error codes.");process.exitCode=1;}
