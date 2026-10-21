/**
 * Phone home-screen (standalone) launch splash.
 *
 * Head script runs before body paint: flips `html.booting` so the overlay is
 * visible immediately and the document background matches (no black gap after
 * the Apple startup image). Body script colors the wordmark and keeps the
 * overlay up until `window.load` so the page can stream/hydrate behind it.
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
html.booting #app-boot{display:flex;pointer-events:auto;background:#f2f2f7}
html.booting.dark #app-boot{background:#0c0d11}`;

/** Runs right after #app-boot in <body>. */
export const APP_BOOT_SCRIPT = `(function(){
  ${DETECT}
  var boot=document.getElementById("app-boot");
  if(!app){
    document.documentElement.classList.remove("booting");
    document.documentElement.removeAttribute("data-standalone");
    if(boot){boot.style.display="none";boot.style.opacity="0";}
    return;
  }
  document.documentElement.classList.add("booting");
  document.documentElement.setAttribute("data-standalone","");
  var dark=document.documentElement.classList.contains("dark");
  var bg=dark?"#0c0d11":"#f2f2f7";
  var fg=dark?"#f4f4f5":"#1d1d1f";
  document.documentElement.style.backgroundColor=bg;
  if(boot){
    boot.style.background=bg;
    boot.style.display="flex";
    var word=boot.querySelector("[data-boot-word]");
    if(word) word.style.color=fg;
  }
  function hide(){
    if(boot){
      boot.style.opacity="0";
      boot.style.pointerEvents="none";
    }
    window.setTimeout(function(){
      document.documentElement.classList.remove("booting");
      if(boot) boot.style.display="none";
    },420);
  }
  /* Keep splash until the load event so HTML/CSS/JS can finish behind it. */
  if(document.readyState==="complete") hide();
  else window.addEventListener("load",hide,{once:true});
})();`;
