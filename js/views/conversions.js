import { DataGrid } from "../components/data-grid.js";
import { PlayerStore } from "../stores/player.js";
import { ConversionStore } from "../stores/inventory-ledger.js";
import { ItemCatalogStore } from "../stores/item-catalog.js";
import { ItemCatalogService } from "../services/item-catalog-service.js";
import { Events } from "../events.js";

function formatDate(timestamp){ return timestamp ? new Date(timestamp * 1000).toLocaleString() : "—"; }
function formatMoney(value){ return Number.isFinite(value) ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value) : "Unknown"; }
function gainLossCell(value){
  const valueNode = document.createElement("span");
  valueNode.className = `tct-conversions__gain-loss ${value > 0 ? "tct-conversions__gain-loss--positive" : value < 0 ? "tct-conversions__gain-loss--negative" : ""}`.trim();
  valueNode.textContent = formatMoney(value);
  return valueNode;
}
function names(lines, catalog){
  return (lines ?? []).map((line) => `${line.quantity} × ${catalog.get(Number(line.itemId)) ?? `Item #${line.itemId}`}`).join(", ") || "None";
}

let subscription = null;

export default {
  route: "conversions",
  title: "Conversion History",
  render(){
    const card = document.createElement("div");
    card.className = "card tct-conversions";
    card.innerHTML = "<h2>Conversion History</h2><p>Tracked inventory transformations use FIFO cost-lot consumption and immutable market snapshots.</p><div id=conversionTable></div>";
    return card;
  },
  async mount(){
    const table = document.getElementById("conversionTable");
    const grid = new DataGrid({
      columns: [
        { label: "Timestamp", key: "timestamp", type: "number", defaultSort: true, format: formatDate },
        { label: "Item Opened", key: "inputs" },
        { label: "Cash Received", key: "cashReceived", type: "number", format: formatMoney },
        { label: "Items Received", key: "outputs" },
        { label: "Original Cost Basis", key: "originalCostBasis", type: "number", format: formatMoney },
        { label: "Value Received", key: "valueReceived", type: "number", format: formatMoney },
        { label: "Net Gain/Loss", key: "estimatedValueDelta", type: "number", renderCell: gainLossCell },
      ],
      storageKey: "tct.grid.conversions.sort",
      emptyMessage: "No inventory conversions have been recorded.",
    });
    table.replaceChildren(grid.element);
    const render = () => {
      const playerId = PlayerStore.current()?.id;
      const catalog = new Map(ItemCatalogStore.all().map((item) => [item.id, item.name]));
      const rows = playerId === null || playerId === undefined ? [] : ConversionStore.all(playerId).map((record) => ({
        ...record,
        inputs: names(record.inputItems, catalog),
        outputs: names(record.outputItems, catalog),
        estimatedValueDelta: Number.isFinite(record.estimatedValueDelta)
          ? record.estimatedValueDelta
          : Number.isFinite(record.valueReceived) && Number.isFinite(record.originalCostBasis)
            ? record.valueReceived - record.originalCostBasis
            : null,
      }));
      grid.setRows(rows);
    };
    subscription = render;
    Events.on("conversionLedgerUpdated", subscription);
    Events.on("connectionChanged", subscription);
    render();
    void ItemCatalogService.ensureLoaded().then(render).catch(() => {});
  },
  async destroy(){
    if (subscription) Events.off("conversionLedgerUpdated", subscription);
    subscription = null;
  },
};
