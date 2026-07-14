import { DataGrid } from "../components/data-grid.js";
import { Events } from "../events.js";
import { PurchaseSyncService } from "../services/purchase-sync-service.js";
import { ItemStore } from "../stores/items.js";
import { ItemCatalogService } from "../services/item-catalog-service.js";
import { ItemCatalogStore } from "../stores/item-catalog.js";

let subscriptions = [];
let grid = null;
let renderState = null;

function formatDate(timestamp){
  return timestamp ? new Date(timestamp * 1000).toLocaleString() : "—";
}

function formatMoney(value){
  return Number.isFinite(value) ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value) : "Unknown";
}

function sourceLabel(record){
  const label = {
    bazaar: "Bazaar",
    itemMarket: "Item Market",
    cityShop: "City Shop",
    abroadShop: "Abroad",
    trade: "Trade",
    unknown: "Unknown",
  }[record.sourceType] ?? record.sourceType;
  return record.sourceType === "abroadShop" && record.sourceLocation
    ? `Abroad - ${record.sourceLocation}`
    : label;
}

function gridRows(records, itemNames){
  return records.flatMap((record) => record.itemLines.map((line, lineIndex) => ({
    ...record,
    id: `${record.id}:${lineIndex}`,
    source: sourceLabel(record),
    itemName: itemNames.get(line.itemId) ?? `Item #${line.itemId}`,
    quantity: line.quantity,
    unitCost: line.knownUnitCost,
    lineCost: line.knownLineTotal ?? (record.itemLines.length === 1 ? record.totalCashCost : null),
  })));
}

function itemLineText(record){
  return record.itemLines.map((line) => `${line.quantity} × #${line.itemId}`).join(", ");
}

function addListener(event, callback){
  Events.on(event, callback);
  subscriptions.push([event, callback]);
}

function clearListeners(){
  subscriptions.forEach(([event, callback]) => Events.off(event, callback));
  subscriptions = [];
}

function createSummary(state){
  const summary = document.createElement("div");
  summary.className = "tct-purchase-summary";
  [
    ["Acquisitions", state.statistics.acquisitionCount],
    ["Oldest", formatDate(state.statistics.oldestTimestamp)],
    ["Newest", formatDate(state.statistics.newestTimestamp)],
    ["Unresolved trades", state.statistics.unresolvedTradeCount],
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = label;
    const span = document.createElement("span");
    span.textContent = value;
    item.append(strong, span);
    summary.appendChild(item);
  });
  return summary;
}

function refresh(){
  renderState?.();
}

export default {
  route: "purchases",
  title: "Purchases",

  render(){
    const card = document.createElement("div");
    card.className = "card tct-purchases";
    card.innerHTML = `<h2>Purchases</h2><div id="purchaseContent"></div>`;
    return card;
  },

  async mount(){
    const content = document.getElementById("purchaseContent");
    let busy = false;

    const showMessage = (message, kind = "") => {
      const status = content.querySelector(".tct-purchases__message");
      if (!status) return;
      status.className = `tct-purchases__message ${kind}`.trim();
      status.textContent = message;
    };

    const buildGrid = (records) => {
      const itemNames = new Map(ItemStore.items().map((item) => [Number(item.id), item.name]));
      ItemCatalogStore.all().forEach((item) => itemNames.set(item.id, item.name));
      grid = new DataGrid({
        columns: [
          { label: "Date", key: "timestamp", type: "number", defaultSort: true, format: formatDate },
          { label: "Source", key: "source" },
          { label: "Qty", key: "quantity", type: "number" },
          { label: "Item Name", key: "itemName" },
          { label: "Cost Each", key: "unitCost", type: "number", format: formatMoney },
          { label: "Total Cost", key: "lineCost", type: "number", format: formatMoney },
          { label: "Allocation", key: "allocationStatus", format: (value) => value === "unresolved" ? "Unresolved" : "Known" },
        ],
        rows: gridRows(records, itemNames),
        storageKey: "tct.grid.purchases.sort",
        emptyMessage: "No item acquisitions were found in this history range.",
      });
      return grid.element;
    };

    renderState = () => {
      let state;
      try {
        state = PurchaseSyncService.state();
      } catch (error) {
        content.replaceChildren();
        const message = document.createElement("p");
        message.className = "tct-purchases__message error";
        message.textContent = error.message;
        content.appendChild(message);
        return;
      }

      content.replaceChildren();
      const syncState = state.sync;
      const message = document.createElement("p");
      message.className = "tct-purchases__message";
      content.appendChild(message);

      if (!syncState.initialSyncComplete) {
        const setup = document.createElement("section");
        setup.className = "tct-purchases__setup";
        const heading = document.createElement("h3");
        heading.textContent = "Set up purchase history";
        const help = document.createElement("p");
        help.textContent = "Choose how many recent days to import. This first sync only reads from that boundary forward and can be safely retried if interrupted. Torn requires a Full access key to read logs.";
        const label = document.createElement("label");
        label.htmlFor = "purchaseDays";
        label.textContent = "Days of history (1–180)";
        const input = document.createElement("input");
        input.id = "purchaseDays";
        input.type = "text";
        input.inputMode = "numeric";
        input.pattern = "[0-9]*";
        input.value = String(Math.round((Date.now() / 1000 - (syncState.initialFromTimestamp ?? Date.now() / 1000 - 30 * 86400)) / 86400) || 30);
        input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, ""); });
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tct-purchases__button";
        button.textContent = syncState.initialFromTimestamp ? "Resume initial sync" : "Start initial sync";
        button.disabled = busy;
        button.addEventListener("click", async () => {
          const days = Number(input.value);
          if (!Number.isInteger(days) || days < 1 || days > 180) {
            showMessage("Enter a whole number of days from 1 to 180.", "error");
            return;
          }
          busy = true;
          button.disabled = true;
          showMessage("Preparing purchase history...");
          try { await PurchaseSyncService.initialSync(days); }
          catch (error) { showMessage(error.message, "error"); }
          finally { busy = false; refresh(); }
        });
        setup.append(heading, help, label, input, button);
        content.appendChild(setup);
        if (syncState.lastError) showMessage(syncState.lastError, "error");
        return;
      }

      const controls = document.createElement("div");
      controls.className = "tct-purchases__controls";
      const sync = document.createElement("button");
      sync.type = "button";
      sync.className = "tct-purchases__button";
      sync.textContent = "Sync purchases";
      sync.disabled = busy;
      sync.addEventListener("click", async () => {
        busy = true;
        sync.disabled = true;
        showMessage("Synchronizing purchases...");
        try { await PurchaseSyncService.incrementalSync(); }
        catch (error) { showMessage(error.message, "error"); }
        finally { busy = false; refresh(); }
      });
      controls.append(sync);
      content.append(controls, createSummary(state), buildGrid(state.records));
      if (syncState.lastError) showMessage(syncState.lastError, "error");
      else if (syncState.lastSuccessfulAt) showMessage(`Last synchronized ${new Date(syncState.lastSuccessfulAt).toLocaleString()}.`, "success");
    };

    addListener("purchaseSyncStarted", refresh);
    addListener("purchaseSyncProgress", (update) => showMessage(update.message ?? "Downloading purchase logs..."));
    addListener("purchaseSyncCompleted", refresh);
    addListener("purchaseSyncFailed", refresh);
    addListener("connectionChanged", refresh);
    refresh();
    void ItemCatalogService.ensureLoaded()
      .then(refresh)
      .catch(() => { /* Owned-item names remain available if catalog loading fails. */ });
  },

  async destroy(){
    clearListeners();
    grid = null;
    renderState = null;
  },
};
