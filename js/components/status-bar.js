/**
 * Application-wide status display driven by synchronization events.
 */
import { Events } from "../events.js";
import { ItemStore } from "../stores/items.js";
import { PlayerStore } from "../stores/player.js";
import { PurchaseStore } from "../stores/purchases.js";

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
    this.onPurchaseSyncCompleted = ()=>{
      this.status = "Purchase synchronization complete.";
      this.render();
    };
    Events.on("statusChanged", this.onStatusChanged);
    Events.on("itemsSynced", this.onItemsSynced);
    Events.on("connectionChanged", this.onConnectionChanged);
    Events.on("purchaseSyncCompleted", this.onPurchaseSyncCompleted);
    this.render();
  }

  destroy(){
    Events.off("statusChanged", this.onStatusChanged);
    Events.off("itemsSynced", this.onItemsSynced);
    Events.off("connectionChanged", this.onConnectionChanged);
    Events.off("purchaseSyncCompleted", this.onPurchaseSyncCompleted);
  }

  lastPurchaseSync(){
    if (!this.player?.id) return null;
    return PurchaseStore.state(this.player.id).lastSuccessfulAt;
  }

  render(){
    this.container.replaceChildren();
    this.container.classList.add("tct-status-bar");
    this.container.appendChild(this.createPlayerIdentity());
    const values = [
      ["Last Item Sync", formatDate(this.statistics.lastUpdated)],
      ["Last Purchase Sync", formatDate(this.lastPurchaseSync())],
      ["Status", this.status],
    ];
    const details = document.createElement("div");
    details.className = "tct-status-bar__details";
    values.forEach(([label, value])=>{
      const item = document.createElement("span");
      item.className = "tct-status-bar__item";
      item.textContent = `${label}: ${value}`;
      details.appendChild(item);
    });
    this.container.appendChild(details);
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
