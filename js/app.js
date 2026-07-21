import { Router } from "./router.js";
import { Events } from "./events.js";
import { StatusBar } from "./components/status-bar.js";
import { PlayerStore } from "./stores/player.js";
import { SnapshotService } from "./services/history/snapshot-service.js";
import { initializeSidebarToggle } from "./sidebar-controller.js";
import { Database } from "./database/database-client.js";
import { RawLogs } from "./services/raw-log-import-service.js";

import Dashboard from "./views/dashboard.js";
import Items from "./views/items.js";
import Purchases from "./views/purchases.js";
import Conversions from "./views/conversions.js";
import Statistics from "./views/statistics.js";
import Readme from "./views/readme.js";
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

[Dashboard, Items, Purchases, Conversions, Statistics, Readme, Settings].forEach((view) =>
  Router.register(view),
);

initializeSidebarToggle();
new StatusBar(document.getElementById("status"));
SnapshotService.start();
// SQLite is initialized opportunistically. LocalStorage stores remain the
// active persistence layer until their repository migrations are verified.
void Database.initialize().then((result) => {
  // A browser refresh cannot leave an archive import ambiguously "running".
  // This never starts an import and does not affect LocalStorage workflows.
  if (result.available) return RawLogs.recoverInterruptedRuns().catch((error) => console.warn("Unable to recover raw-log archive state:", error.message));
  return null;
});
void applyVersion();
void PlayerStore.refreshIfConfigured()
  .then((player)=>{
    if (player) Events.emit("connectionChanged", { player });
  })
  .catch((error)=>console.warn("Unable to refresh cached player profile:", error));

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
