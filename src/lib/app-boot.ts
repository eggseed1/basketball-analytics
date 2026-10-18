/** Phone home-screen app only. Browser and desktop visits drop the splash before paint. */
export const APP_BOOT_SCRIPT = `(function(){
  var standalone = false;
  var phone = false;
  try {
    standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    phone = Math.min(window.screen.width, window.screen.height) <= 767;
  } catch (e) {}
  var app = standalone && phone;
  if (app) document.documentElement.setAttribute("data-standalone", "");
  else document.documentElement.removeAttribute("data-standalone");
  var boot = document.getElementById("app-boot");
  if (!app) {
    document.documentElement.classList.remove("booting");
    return;
  }
  document.documentElement.classList.add("booting");
  if (boot) {
    var dark = document.documentElement.classList.contains("dark");
    boot.style.background = dark ? "#0c0d11" : "#f2f2f7";
    var word = boot.querySelector("[data-boot-word]");
    if (word) word.style.color = dark ? "#f4f4f5" : "#1d1d1f";
  }
  function hide(){
    if (boot) boot.style.opacity = "0";
    window.setTimeout(function(){ document.documentElement.classList.remove("booting"); }, 420);
  }
  if (document.readyState === "complete") hide();
  else window.addEventListener("load", hide);
})();`;
