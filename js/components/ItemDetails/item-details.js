/**
 * Displays one selected OwnedItem using independent, canonical stores.
 */
import { Events } from "../../events.js";
import { createItemImage } from "../item-image.js";
import { CostBasisService } from "../../services/analysis/cost-basis-service.js";
import { PlayerStore } from "../../stores/player.js";
import { PurchaseStore } from "../../stores/purchases.js";
import { ItemStore } from "../../stores/items.js";

const LOCATION_LABELS = {
  inventory: "Inventory",
  bazaar: "Bazaar",
  displayCase: "Display Case",
  itemMarket: "Item Market",
};

function formatDate(timestamp){
  return timestamp ? new Date(timestamp).toLocaleString() : "Never";
}

function formatPurchaseDate(timestamp){
  return timestamp ? new Date(timestamp * 1000).toLocaleString() : "Unknown";
}

function formatMoney(value){
  return Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value)
    : "Unknown";
}

function formatPercent(value){
  return `${Number(value).toFixed(1)}%`;
}

export class ItemDetails {
  constructor(){
    this.tabs = [
      { id: "general", label: "General", enabled: true },
      { id: "locations", label: "Locations", enabled: false },
      { id: "purchases", label: "Purchases", enabled: true },
      { id: "statistics", label: "Statistics", enabled: false },
      { id: "market", label: "Market", enabled: false },
    ];
    this.activeTab = "general";
    this.item = null;
    this.element = document.createElement("section");
    this.element.className = "tct-item-details";
    this.onItemSelected = ({ item }) => this.setItem(item);
    this.onItemsSynced = () => this.refreshSelectedItem();
    this.onPurchaseChanged = () => this.render();
    this.onItemCacheCleared = () => { this.item = null; this.render(); };
    Events.on("itemSelected", this.onItemSelected);
    Events.on("itemsSynced", this.onItemsSynced);
    Events.on("purchaseSyncCompleted", this.onPurchaseChanged);
    Events.on("purchaseCacheCleared", this.onPurchaseChanged);
    Events.on("itemCacheCleared", this.onItemCacheCleared);
    this.render();
  }

  destroy(){
    Events.off("itemSelected", this.onItemSelected);
    Events.off("itemsSynced", this.onItemsSynced);
    Events.off("purchaseSyncCompleted", this.onPurchaseChanged);
    Events.off("purchaseCacheCleared", this.onPurchaseChanged);
    Events.off("itemCacheCleared", this.onItemCacheCleared);
  }

  setItem(item){
    this.item = item;
    this.render();
  }

  refreshSelectedItem(){
    if (!this.item) return;
    this.item = ItemStore.items().find((item) => String(item.id) === String(this.item.id)) ?? null;
    this.render();
  }

  selectTab(tab){
    if (!tab.enabled) return;
    this.activeTab = tab.id;
    this.render();
  }

  render(){
    this.element.replaceChildren(this.createTabs(), this.createContent());
  }

  createTabs(){
    const tabs = document.createElement("div");
    tabs.className = "tct-item-details__tabs";
    tabs.setAttribute("role", "tablist");
    this.tabs.forEach((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = tab.label;
      button.disabled = !tab.enabled;
      button.className = "tct-item-details__tab";
      button.classList.toggle("active", this.activeTab === tab.id);
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(this.activeTab === tab.id));
      button.addEventListener("click", () => this.selectTab(tab));
      tabs.appendChild(button);
    });
    return tabs;
  }

  createContent(){
    const content = document.createElement("div");
    content.className = "tct-item-details__content";
    if (!this.item) {
      content.textContent = "Select an item to view its details.";
      return content;
    }
    return this.activeTab === "purchases" ? this.createPurchasesContent(content) : this.createGeneralContent(content);
  }

  createGeneralContent(content){
    const title = document.createElement("h3");
    title.className = "tct-item-details__title";
    const name = document.createElement("span");
    name.textContent = this.item.name;
    title.append(createItemImage(this.item, { size: "large", className: "tct-item-image--detail" }), name);
    const details = document.createElement("dl");
    const rows = [
      ["Category", this.item.category || "Unknown"],
      ["Total Quantity", this.item.totalQuantity],
      ...Object.entries(LOCATION_LABELS).map(([key, label]) => [`${label} Quantity`, this.item.locations[key]?.quantity ?? 0]),
      ["Sources", this.item.metadata.sources.join(", ") || "None"],
      ["Last Updated", formatDate(this.item.metadata.lastUpdated)],
    ];
    rows.forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      details.append(term, description);
    });
    content.append(title, details);
    return content;
  }

  createPurchasesContent(content){
    const playerId = PlayerStore.current()?.id;
    const acquisitions = playerId === null || playerId === undefined
      ? []
      : PurchaseStore.byItem(playerId, this.item.id);
    const result = CostBasisService.calculate(this.item, acquisitions);
    const note = document.createElement("p");
    note.className = "tct-item-details__note";
    note.textContent = "Estimated from newest known acquisitions first to represent the lots making up current holdings.";
    const summary = document.createElement("dl");
    summary.className = "tct-item-details__basis-summary";
    [
      ["Current Quantity", result.currentQuantity],
      ["Matched Quantity", result.matchedQuantity],
      ["Priced Quantity", result.pricedQuantity],
      ["Paid Units", result.paidQuantity],
      ["Free / Zero-Cost Units", result.zeroCostQuantity],
      ["Non-Cash Units", result.nonCashQuantity],
      ["Unresolved Quantity", result.unresolvedQuantity],
      ["Unmatched Quantity", result.unmatchedQuantity],
      ["Quantity Coverage", formatPercent(result.quantityCoveragePercent)],
      ["Priced Coverage", formatPercent(result.pricedCoveragePercent)],
      ["Lowest Known Cash Cost", formatMoney(result.lowestKnownUnitCost)],
      ["Highest Known Cash Cost", formatMoney(result.highestKnownUnitCost)],
      ["Average Acquisition Cost", formatMoney(result.weightedAverageUnitCost)],
      ["Known Cash Cost Basis", formatMoney(result.totalKnownCost)],
      ["Oldest Matched Date", formatPurchaseDate(result.oldestMatchedTimestamp)],
      ["Newest Matched Date", formatPurchaseDate(result.newestMatchedTimestamp)],
    ].forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      summary.append(term, description);
    });
    const historyNote = document.createElement("p");
    historyNote.className = "tct-item-details__note";
    historyNote.textContent = "View complete acquisition history on the Purchases page.";
    const warnings = document.createElement("ul");
    warnings.className = "tct-item-details__warnings";
    result.warnings.forEach((warning) => {
      const row = document.createElement("li");
      row.textContent = warning;
      warnings.appendChild(row);
    });
    content.append(note, summary, historyNote, warnings);
    return content;
  }
}
