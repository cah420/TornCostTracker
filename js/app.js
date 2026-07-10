import { Router } from "./router.js";
import { Events } from "./events.js";
import { StatusBar } from "./components/status-bar.js";

import Dashboard from "./views/dashboard.js";
import Items from "./views/items.js";
import Purchases from "./views/purchases.js";
import Statistics from "./views/statistics.js";
import Settings from "./views/settings.js";

async function applyVersion(){
  try{
    const response = await fetch("./version.json");
    if (!response.ok) throw new Error(`Version request failed: ${response.status}`);
    const { version } = await response.json();
    if (!version) throw new Error("Version is missing from version.json");

    document.getElementById("version").textContent = `Version ${version}`;
    document.getElementById("footerVersion").textContent = `Release ${version}`;
  }catch(error){
    console.error("Unable to load application version:", error);
    document.getElementById("version").textContent = "Version unavailable";
    document.getElementById("footerVersion").textContent = "Release unavailable";
  }
}

[Dashboard, Items, Purchases, Statistics, Settings].forEach((view) =>
  Router.register(view),
);

new StatusBar(document.getElementById("status"));
void applyVersion();

document.querySelectorAll(".nav-button").forEach((btn) => {
  btn.addEventListener("click", () => Router.navigate(btn.dataset.page));
});

Events.on("routeChanged", ({ title, route }) => {
  document.getElementById("pageTitle").textContent = title;

  document.querySelectorAll(".nav-button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === route);
  });
});

window.addEventListener("DOMContentLoaded", () => {
  Router.navigate("dashboard");
});
