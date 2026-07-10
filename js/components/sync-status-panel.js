/**
 * Displays synchronization source states and the most recent summary.
 */
import { Events } from "../events.js";

const SOURCE_LABELS = {
  inventory: "Inventory",
  bazaar: "Bazaar",
  displayCase: "Display Case",
  itemMarket: "Item Market",
};

export class SyncStatusPanel {
  constructor(getState, { onRefresh = null } = {}){
    this.getState = getState;
    this.onRefresh = onRefresh;
    this.refreshing = false;
    this.collapsed = { status: false, summary: false, statistics: false };
    this.element = document.createElement("section");
    this.element.className = "tct-sync-status";
    this.onChange = ()=>this.render();
    Events.on("statusChanged", this.onChange);
    Events.on("itemsSynced", this.onChange);
    this.render();
  }

  destroy(){
    Events.off("statusChanged", this.onChange);
    Events.off("itemsSynced", this.onChange);
  }

  render(){
    const { sources, summary, statistics } = this.getState();
    this.element.replaceChildren();
    const list = document.createElement("ul");

    Object.entries(SOURCE_LABELS).forEach(([key, label])=>{
      const source = sources[key];
      const row = document.createElement("li");
      row.className = `tct-sync-status__${source.state}`;
      row.textContent = `${label}: ${source.label}`;
      if (source.detail) {
        const detail = document.createElement("small");
        detail.textContent = source.detail;
        row.appendChild(detail);
      }
      list.appendChild(row);
    });
    this.element.append(
      this.createSection("status", "Synchronization Status", this.createStatusContent(list)),
      this.createSection("summary", "Last Synchronization", this.createSummary(summary)),
      this.createSection("statistics", "Item Statistics", this.createStatistics(statistics)),
    );
  }

  createStatusContent(list){
    const content = document.createElement("div");
    content.appendChild(list);
    if (this.onRefresh) {
      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "tct-sync-status__refresh";
      refresh.textContent = this.refreshing ? "Synchronizing..." : "Refresh Items";
      refresh.disabled = this.refreshing;
      refresh.addEventListener("click", ()=>this.refresh());
      content.appendChild(refresh);
    }
    return content;
  }

  async refresh(){
    if (this.refreshing || !this.onRefresh) return;
    this.refreshing = true;
    this.render();
    try{
      await this.onRefresh();
    }finally{
      this.refreshing = false;
      this.render();
    }
  }

  createSection(id, title, content){
    const section = document.createElement("section");
    section.className = "tct-sync-status__section";
    const header = document.createElement("div");
    header.className = "tct-sync-status__header";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tct-sync-status__toggle";
    toggle.textContent = String.fromCharCode(this.collapsed[id] ? 0x25B8 : 0x25BE);
    toggle.title = this.collapsed[id] ? `Expand ${title}` : `Collapse ${title}`;
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-expanded", String(!this.collapsed[id]));
    toggle.addEventListener("click", ()=>{
      this.collapsed[id] = !this.collapsed[id];
      this.render();
    });
    header.append(heading, toggle);
    section.appendChild(header);
    if (!this.collapsed[id]) section.appendChild(content);
    return section;
  }

  createSummary(summary){
    const section = document.createElement("div");
    section.className = "tct-sync-status__summary";
    if (!summary) {
      section.textContent = "No synchronization completed yet.";
      return section;
    }
    const values = [
      ["Inventory items", summary.inventoryItemCount],
      ["Bazaar items", summary.bazaarItemCount],
      ["Merged unique items", summary.totalUniqueOwnedItems],
      ["Total quantities", summary.totalItemQuantity],
      ["Elapsed", `${summary.duration} ms`],
    ];
    values.forEach(([label, value])=>{
      const line = document.createElement("div");
      line.textContent = `${label}: ${value}`;
      section.appendChild(line);
    });
    return section;
  }

  createStatistics(statistics){
    const section = document.createElement("div");
    section.className = "tct-sync-status__summary";
    [["Unique Items", statistics.uniqueItems], ["Total Quantity", statistics.totalQuantity]]
      .forEach(([label, value])=>{
        const line = document.createElement("div");
        line.textContent = `${label}: ${value}`;
        section.appendChild(line);
      });
    return section;
  }
}
