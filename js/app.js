import "./core.js";
import "./router.js";

document.querySelectorAll(".nav-button").forEach(btn=>{
  btn.addEventListener("click", ()=>TCT.router.load(btn.dataset.page));
});

window.addEventListener("DOMContentLoaded", ()=>TCT.init());
