/**
 * Application-wide status display driven by synchronization events.
 */
import { Events } from "../events.js";
import { ItemStore } from "../stores/items.js";

function formatDate(timestamp){
  return timestamp ? new Date(timestamp).toLocaleString() : "Never";
}

export class StatusBar {
  constructor(container){
    this.container = container;
    this.user = "Not connected";
    this.status = "Ready";
    this.statistics = ItemStore.statistics();
    this.onStatusChanged = (update)=>{
      this.status = update.message ?? this.status;
      this.render();
    };
    this.onItemsSynced = ({ statistics })=>{
      this.statistics = statistics;
      this.status = "Synchronization Complete";
      this.render();
    };
    this.onConnectionChanged = ({ player })=>{
      this.user = player?.name ?? "Not connected";
      this.render();
    };
    Events.on("statusChanged", this.onStatusChanged);
    Events.on("itemsSynced", this.onItemsSynced);
    Events.on("connectionChanged", this.onConnectionChanged);
    this.render();
  }

  destroy(){
    Events.off("statusChanged", this.onStatusChanged);
    Events.off("itemsSynced", this.onItemsSynced);
    Events.off("connectionChanged", this.onConnectionChanged);
  }

  render(){
    this.container.replaceChildren();
    this.container.classList.add("tct-status-bar");
    const values = [
      ["Connected User", this.user],
      ["Owned Items", this.statistics.uniqueItems],
      ["Last Synchronization", formatDate(this.statistics.lastUpdated)],
      ["Status", this.status],
    ];
    values.forEach(([label, value])=>{
      const item = document.createElement("span");
      item.className = "tct-status-bar__item";
      item.textContent = `${label}: ${value}`;
      this.container.appendChild(item);
    });
  }
}
