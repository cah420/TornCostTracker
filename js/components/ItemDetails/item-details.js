/**
 * Displays one selected OwnedItem using independent, canonical stores.
 */
import { Events } from "../../events.js";
import { createItemImage } from "../item-image.js";
import { ItemStore } from "../../stores/items.js";
import { MarketValueService } from "../../services/market-value-service.js";
import { PurchasesQueries } from "../../services/purchases/purchases-query-service.js";

const LOCATION_LABELS = {
  inventory: "Inventory",
  bazaar: "Bazaar",
  displayCase: "Display Case",
  itemMarket: "Item Market",
};

function formatDate(timestamp){
  return timestamp ? new Date(timestamp).toLocaleString() : "Never";
}

function formatMoney(value){
  return Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value)
    : "Unknown";
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
    this.purchaseRequest = 0;
    this.element = document.createElement("section");
    this.element.className = "tct-item-details";
    this.onItemSelected = ({ item }) => this.setItem(item);
    this.onItemsSynced = () => this.refreshSelectedItem();
    this.onItemCacheCleared = () => { this.item = null; this.render(); };
    this.onMarketValuesUpdated = () => this.render();
    Events.on("itemSelected", this.onItemSelected);
    Events.on("itemsSynced", this.onItemsSynced);
    Events.on("itemCacheCleared", this.onItemCacheCleared);
    Events.on("marketValuesUpdated", this.onMarketValuesUpdated);
    this.render();
  }

  destroy(){
    Events.off("itemSelected", this.onItemSelected);
    Events.off("itemsSynced", this.onItemsSynced);
    Events.off("itemCacheCleared", this.onItemCacheCleared);
    Events.off("marketValuesUpdated", this.onMarketValuesUpdated);
  }

  setItem(item){
    this.item = item;
    this.render();
    void MarketValueService.ensureLoaded().catch(() => { /* Values remain unavailable without affecting item details. */ });
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
    const marketValue = MarketValueService.lookup(this.item.id);
    const rows = [
      ["Category", this.item.category || "Unknown"],
      ["Total Quantity", this.item.totalQuantity],
      ...Object.entries(LOCATION_LABELS).map(([key, label]) => [`${label} Quantity`, this.item.locations[key]?.quantity ?? 0]),
      ["Sources", this.item.metadata.sources.join(", ") || "None"],
      ["Last Updated", formatDate(this.item.metadata.lastUpdated)],
      ["Current Market Value", formatMoney(marketValue?.marketPrice)],
      ["Vendor Sell Value", formatMoney(marketValue?.vendorSellPrice)],
      ["Effective Value", formatMoney(marketValue?.effectiveValue)],
      ["Estimated Inventory Value", marketValue?.marketPrice !== null && marketValue?.marketPrice !== undefined ? formatMoney(marketValue.marketPrice * this.item.totalQuantity) : "Unknown"],
      ["Last Market Update", formatDate(MarketValueService.updatedAt())],
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
    const note = document.createElement("p");
    note.className = "tct-item-details__note";
    note.textContent = "Loading SQLite Inventory Position and Cost Lot facts...";
    content.append(note);
    const itemId = String(this.item.id);
    const request = ++this.purchaseRequest;
    void PurchasesQueries.listPositions({ search: itemId, limit: 500 })
      .then(async (result) => {
        if (request !== this.purchaseRequest || String(this.item?.id) !== itemId) return;
        const positions = result.rows.filter((row) => row.itemId === itemId);
        if (!result.ready) throw new Error(result.reason);
        if (!positions.length) { note.textContent = "No remaining SQLite accounting position exists for this item."; return; }
        if (positions.length > 1) {
          note.textContent = `${positions.length} separate accounting positions exist for this item. UID positions are not merged. Open Purchases to inspect each position.`;
          return;
        }
        const details = await PurchasesQueries.getDetails(positions[0].id);
        if (request !== this.purchaseRequest || String(this.item?.id) !== itemId) return;
        const summary = document.createElement("dl"); summary.className = "tct-item-details__basis-summary";
        [
          ["Accounting Remaining Quantity", details.remainingQuantity],
          ["Current Torn Quantity", details.currentQuantityComparison.currentTornQuantity ?? "Unavailable"],
          ["Quantity Comparison", details.currentQuantityComparison.state.replaceAll("_", " ")],
          ["Known Remaining Quantity", details.knownRemainingQuantity],
          ["Deferred Quantity", details.deferredQuantity],
          ["Unknown Quantity", details.unknownQuantity],
          ["Basis Completeness", details.basisCompleteness],
          ["Complete Remaining Basis", details.completeRemainingBasis === null ? "Not fully known" : formatMoney(details.completeRemainingBasis)],
          ["Known Remaining Basis", formatMoney(details.knownRemainingBasis)],
          ["Weighted Average Known Unit Basis", formatMoney(details.weightedAverageKnownUnitBasis)],
          ["Lowest Known Unit Basis", formatMoney(details.lowestKnownUnitBasis)],
          ["Highest Known Unit Basis", formatMoney(details.highestKnownUnitBasis)],
        ].forEach(([label, value]) => { const term = document.createElement("dt"); term.textContent = label; const description = document.createElement("dd"); description.textContent = value; summary.append(term, description); });
        const historyNote = document.createElement("p"); historyNote.className = "tct-item-details__note"; historyNote.textContent = "Open Purchases to inspect the position's Cost Lots, FIFO consumptions, and trace references.";
        note.replaceWith(summary, historyNote);
      })
      .catch((error) => { if (request === this.purchaseRequest) note.textContent = `Purchase position unavailable: ${error.message}`; });
    return content;
  }
}
