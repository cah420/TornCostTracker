import { Router } from "./router.js";
import { Events } from "./events.js";

import Dashboard from "./views/dashboard.js";
import Inventory from "./views/inventory.js";
import Purchases from "./views/purchases.js";
import Statistics from "./views/statistics.js";
import Settings from "./views/settings.js";

[
    Dashboard,
    Inventory,
    Purchases,
    Statistics,
    Settings
].forEach(view => Router.register(view));

document.querySelectorAll(".nav-button").forEach(btn=>{
    btn.addEventListener("click",()=>Router.navigate(btn.dataset.page));
});

Events.on("routeChanged",({title,route})=>{
    document.getElementById("pageTitle").textContent = title;

    document.querySelectorAll(".nav-button").forEach(btn=>{
        btn.classList.toggle("active",btn.dataset.page===route);
    });
});

window.addEventListener("DOMContentLoaded",()=>{
    Router.navigate("dashboard");
});
