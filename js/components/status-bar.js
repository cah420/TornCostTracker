/**
 * Application-wide status display driven by synchronization events.
 */
import { Events } from "../events.js";
import { ItemStore } from "../stores/items.js";
import { PlayerStore } from "../stores/player.js";

function formatDate(timestamp){
  return timestamp ? new Date(timestamp).toLocaleString() : "Never";
}

export class StatusBar {
  constructor(container){
    this.container = container;
    this.player = PlayerStore.current();
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
      this.player = player ?? null;
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
    this.container.appendChild(this.createPlayerIdentity());
    const values = [
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

  createPlayerIdentity(){
    const identity = document.createElement("div");
    identity.className = "tct-status-bar__profile";

    if (!this.player) {
      identity.textContent = "Connected User: Not connected";
      return identity;
    }

    const avatar = document.createElement("img");
    avatar.className = "tct-status-bar__avatar";
    avatar.src = this.player.avatar;
    avatar.alt = `${this.player.name} profile`;
    avatar.addEventListener("error", ()=>{ avatar.hidden = true; }, { once: true });

    const details = document.createElement("span");
    details.className = "tct-status-bar__player-details";
    const name = document.createElement("strong");
    name.textContent = `${this.player.name} [${this.player.id}]`;
    const level = document.createElement("span");
    level.textContent = `Level ${this.player.level}`;
    details.append(name, level);
    identity.append(avatar, details);
    return identity;
  }
}
