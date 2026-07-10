/**
 * Displays one selected OwnedItem. The tab list is intentionally extensible.
 */
import { Events } from "../../events.js";
import { createItemImage } from "../item-image.js";

const LOCATION_LABELS = {
  inventory: "Inventory",
  bazaar: "Bazaar",
  displayCase: "Display Case",
  itemMarket: "Item Market",
};

function formatDate(timestamp){
  return timestamp ? new Date(timestamp).toLocaleString() : "Never";
}

export class ItemDetails {
  constructor(){
    this.tabs = [
      { id: "general", label: "General", enabled: true },
      { id: "locations", label: "Locations", enabled: false },
      { id: "purchases", label: "Purchases", enabled: false },
      { id: "statistics", label: "Statistics", enabled: false },
      { id: "market", label: "Market", enabled: false },
    ];
    this.activeTab = "general";
    this.item = null;
    this.element = document.createElement("section");
    this.element.className = "tct-item-details";
    this.onItemSelected = ({ item }) => this.setItem(item);
    Events.on("itemSelected", this.onItemSelected);
    this.render();
  }

  destroy(){
    Events.off("itemSelected", this.onItemSelected);
  }

  setItem(item){
    this.item = item;
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

    this.tabs.forEach((tab)=>{
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = tab.label;
      button.disabled = !tab.enabled;
      button.className = "tct-item-details__tab";
      button.classList.toggle("active", this.activeTab === tab.id);
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(this.activeTab === tab.id));
      button.addEventListener("click", ()=>this.selectTab(tab));
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

    const title = document.createElement("h3");
    title.className = "tct-item-details__title";
    const name = document.createElement("span");
    name.textContent = this.item.name;
    title.append(createItemImage(this.item, { size: "large", className: "tct-item-image--detail" }), name);
    const details = document.createElement("dl");
    const rows = [
      ["Category", this.item.category || "Unknown"],
      ["Total Quantity", this.item.totalQuantity],
      ...Object.entries(LOCATION_LABELS).map(([key, label])=>[
        `${label} Quantity`, this.item.locations[key]?.quantity ?? 0,
      ]),
      ["Sources", this.item.metadata.sources.join(", ") || "None"],
      ["Last Updated", formatDate(this.item.metadata.lastUpdated)],
    ];

    rows.forEach(([label, value])=>{
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      details.append(term, description);
    });
    content.append(title, details);
    return content;
  }
}
