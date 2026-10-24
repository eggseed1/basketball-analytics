/**
 * Phone home-screen (standalone) launch splash.
 *
 * Head script runs before body paint: flips `html.booting` so the overlay is
 * visible immediately and the document background matches (no black gap after
 * the Apple startup image). Body script keeps the overlay up until
 * `window.load` so the page can stream/hydrate behind it.
 *
 * Visibility and colors are CSS-only (`html.booting`, `#app-boot.is-hiding`).
 * The boot scripts must not rewrite `#app-boot` inline styles before React
 * hydrates, or the style attribute mismatches the server markup.
 */

const DETECT = `var standalone=false,phone=false;
try{
  standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
  phone=Math.min(window.screen.width,window.screen.height)<=767;
}catch(e){}
var app=standalone&&phone;`;

/** Runs in <head> after theme boot — before #app-boot exists. */
export const APP_BOOT_HEAD_SCRIPT = `(function(){
  ${DETECT}
  if(!app){
    document.documentElement.classList.remove("booting");
    document.documentElement.removeAttribute("data-standalone");
    return;
  }
  document.documentElement.setAttribute("data-standalone","");
  document.documentElement.classList.add("booting");
  var dark=document.documentElement.classList.contains("dark");
  var bg=dark?"#0c0d11":"#f2f2f7";
  document.documentElement.style.backgroundColor=bg;
  try{document.documentElement.style.setProperty("color-scheme",dark?"dark":"light");}catch(e){}
})();`;

/** Critical CSS so the splash paints even if globals.css is still in flight. */
export const APP_BOOT_CRITICAL_CSS = `html.booting{background:#f2f2f7}
html.booting.dark{background:#0c0d11}
html.booting,html.booting body{min-height:100%}
#app-boot{display:none;position:fixed;inset:0;z-index:80;align-items:center;justify-content:center;flex-direction:column;gap:18px;background:#f2f2f7;transition:opacity .4s ease;pointer-events:none}
#app-boot [data-boot-word]{margin:0;font-size:28px;font-weight:700;letter-spacing:-0.04em;line-height:1;color:#1d1d1f;font-family:var(--font-sans),system-ui,sans-serif}
html.booting #app-boot{display:flex;pointer-events:auto;background:#f2f2f7}
html.booting.dark #app-boot{background:#0c0d11}
html.booting.dark #app-boot [data-boot-word]{color:#f4f4f5}
#app-boot.is-hiding{opacity:0;pointer-events:none}`;

/** Runs right after #app-boot in <body>. */
export const APP_BOOT_SCRIPT = `(function(){
  ${DETECT}
  var boot=document.getElementById("app-boot");
  if(!app){
    document.documentElement.classList.remove("booting");
    document.documentElement.removeAttribute("data-standalone");
    return;
  }
  document.documentElement.classList.add("booting");
  document.documentElement.setAttribute("data-standalone","");
  var dark=document.documentElement.classList.contains("dark");
  var bg=dark?"#0c0d11":"#f2f2f7";
  document.documentElement.style.backgroundColor=bg;
  function hide(){
    if(boot) boot.classList.add("is-hiding");
    window.setTimeout(function(){
      document.documentElement.classList.remove("booting");
      if(boot) boot.classList.remove("is-hiding");
    },420);
  }
  /* Release once the first useful screen can paint. Do not wait for every
     deferred image/script (window.load). Bounded fallback if interactive stalls. */
  var released=false;
  function release(){
    if(released) return;
    released=true;
    hide();
  }
  if(document.readyState==="complete"||document.readyState==="interactive"){
    release();
  }else{
    document.addEventListener("DOMContentLoaded",release,{once:true});
  }
  window.setTimeout(release,1800);
})();`;
