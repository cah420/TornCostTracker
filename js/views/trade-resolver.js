import { DataGrid } from "../components/data-grid.js";
import { ItemCatalogService } from "../services/item-catalog-service.js";
import { ItemCatalogStore } from "../stores/item-catalog.js";
import { TradeResolutions } from "../services/history/trade-resolution-service.js";

let grids = [];
function money(value){ return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value) || 0); }
function date(value){ return value ? new Date(Number(value) * 1000).toLocaleString() : "—"; }
function number(value){ return new Intl.NumberFormat().format(Number(value) || 0); }
function names(groups){
  return groups.map((group) => `${number(group.quantity)} × ${ItemCatalogStore.nameFor(group.itemId) ?? `Item #${group.itemId}`}${group.uids?.length ? ` (${group.uids.length} UIDs)` : ""}`).join(", ");
}
function tradeRow(trade, status){
  return { id: trade.tradeId, tradeId: trade.tradeId, timestamp: trade.timestamp, counterpartyId: trade.counterpartyId ?? "Unknown", cashSent: trade.cashSent, items: names(trade.itemGroups), status, source: trade };
}
function resolutionRow(resolution, status){
  return { id: resolution.id, tradeId: resolution.tradeId, timestamp: resolution.tradeTimestamp, counterpartyId: resolution.counterpartyId ?? "Unknown", cashSent: resolution.totalCashSent, items: names(resolution.allocations), status, source: resolution };
}
function section(title, rows, onClick, emptyMessage){
  const wrapper = document.createElement("section"); wrapper.className = "tct-trade-resolver__section";
  const heading = document.createElement("h3"); heading.textContent = title;
  const host = document.createElement("div");
  const grid = new DataGrid({
    columns: [
      { label: "Trade Date", key: "timestamp", type: "number", defaultSort: true, format: date },
      { label: "Counterparty", key: "counterpartyId" },
      { label: "Cash Sent", key: "cashSent", type: "number", format: money },
      { label: "Items Received", key: "items" },
      { label: "Status", key: "status" },
    ],
    rows, rowKey: "id", onRowClick: onClick,
    storageKey: `tct.grid.trade-resolver.${title.toLocaleLowerCase().replaceAll(" ", "-")}`,
    emptyMessage,
  });
  grids.push(grid); host.appendChild(grid.element); wrapper.append(heading, host); return wrapper;
}

export default {
  route: "trade-resolver",
  title: "Trade Resolver",
  render(){
    const card = document.createElement("div"); card.className = "card tct-trade-resolver";
    card.innerHTML = `<div class="tct-trade-resolver__heading"><div><h2>Trade Resolver</h2><p>Resolve completed cash-for-items trades into versioned accounting acquisitions.</p></div><button id="resolveEligibleTrades" class="tct-purchases__button" type="button">Scan & Resolve Eligible Trades</button></div><p id="tradeResolverMessage" class="tct-purchases__message" aria-live="polite"></p><div id="tradeResolverSummary" class="tct-trade-resolver__summary"></div><div id="tradeResolverSections"></div><section id="tradeResolverDetails" class="tct-trade-resolver__details"><h3>Resolution details</h3><p>Select a trade to inspect or allocate it.</p></section>`;
    return card;
  },
  async mount(){
    const message = document.getElementById("tradeResolverMessage");
    const summary = document.getElementById("tradeResolverSummary");
    const sections = document.getElementById("tradeResolverSections");
    const details = document.getElementById("tradeResolverDetails");
    const scan = document.getElementById("resolveEligibleTrades");
    let dashboard = null;

    const editor = async (source, existing = null) => {
      const trade = existing ? dashboard.trades.find((entry) => entry.tradeId === existing.tradeId) : source;
      if (!trade) { details.innerHTML = "<h3>Resolution details</h3><p>The correlated trade evidence is unavailable.</p>"; return; }
      const prior = existing ? await TradeResolutions.history(existing.tradeId) : [];
      details.replaceChildren();
      const heading = document.createElement("h3"); heading.textContent = `Trade ${trade.tradeId}`;
      const note = document.createElement("p"); note.textContent = `${date(trade.timestamp)} · Counterparty ${trade.counterpartyId ?? "Unknown"} · Cash sent ${money(trade.cashSent)}`;
      const warning = document.createElement("p"); warning.className = "tct-purchases__message warning"; warning.textContent = existing ? `Editing creates resolution version ${existing.resolutionVersion + 1} and requires rebuilding Projection, Ledger, Cost Lots, FIFO, and Inventory Position.` : trade.itemGroups.length === 1 ? "This trade is eligible for automatic single-item resolution." : "Allocate the complete cash amount across every canonical Item ID.";
      const form = document.createElement("div"); form.className = "tct-trade-resolver__allocations";
      const existingTotals = new Map((existing?.allocations ?? []).map((allocation) => [String(allocation.itemId), allocation.totalBasis]));
      const rows = trade.itemGroups.map((group) => {
        const row = document.createElement("div"); row.className = "tct-trade-resolver__allocation";
        const item = document.createElement("strong"); item.textContent = ItemCatalogStore.nameFor(group.itemId) ?? `Item #${group.itemId}`;
        const quantity = document.createElement("span"); quantity.textContent = `Quantity ${number(group.quantity)} · UID count ${number(group.uids.length)}`;
        const totalLabel = document.createElement("label"); totalLabel.textContent = "Allocated Total";
        const total = document.createElement("input"); total.type = "number"; total.min = "0"; total.step = "1"; total.value = String(existingTotals.get(group.itemId) ?? (trade.itemGroups.length === 1 ? trade.cashSent : 0));
        const unitLabel = document.createElement("label"); unitLabel.textContent = "Unit Basis";
        const unit = document.createElement("input"); unit.type = "number"; unit.min = "0"; unit.step = "any"; unit.value = String(Number(total.value) / group.quantity);
        total.addEventListener("input", () => { unit.value = String((Number(total.value) || 0) / group.quantity); validate(); });
        unit.addEventListener("input", () => { total.value = String(Math.round((Number(unit.value) || 0) * group.quantity)); validate(); });
        row.append(item, quantity, totalLabel, total, unitLabel, unit);
        form.appendChild(row);
        return { group, total };
      });
      const balance = document.createElement("p"); balance.className = "tct-purchases__message";
      const resolve = document.createElement("button"); resolve.type = "button"; resolve.className = "tct-purchases__button"; resolve.textContent = existing ? "Create New Resolution Revision" : "Resolve Trade";
      const validate = () => {
        const allocated = rows.reduce((sum, row) => sum + (Number(row.total.value) || 0), 0);
        const valid = rows.every((row) => Number.isInteger(Number(row.total.value)) && Number(row.total.value) >= 0) && allocated === trade.cashSent;
        balance.textContent = `Allocated ${money(allocated)} of ${money(trade.cashSent)}${valid ? " · Balanced" : " · Must balance before resolving"}`;
        balance.className = `tct-purchases__message ${valid ? "success" : "warning"}`; resolve.disabled = !valid;
      };
      resolve.addEventListener("click", async () => {
        resolve.disabled = true;
        try {
          const result = await TradeResolutions.resolve(trade.tradeId, rows.map((row) => ({ itemId: row.group.itemId, totalBasis: Number(row.total.value) })), "manual_multi_item");
          message.textContent = result.created ? `Trade ${trade.tradeId} resolution v${result.resolution.resolutionVersion} saved. Downstream accounting rebuilds are required.` : "The active resolution is already materially identical.";
          message.className = "tct-purchases__message success"; await load();
        } catch (error) { balance.textContent = error.message; balance.className = "tct-purchases__message error"; resolve.disabled = false; }
      });
      const history = document.createElement("details"); const historySummary = document.createElement("summary"); historySummary.textContent = `Revision history (${prior.length})`; history.appendChild(historySummary);
      prior.forEach((revision) => { const p = document.createElement("p"); p.textContent = `v${revision.resolutionVersion} · ${revision.status} · ${revision.resolutionMethod} · resolver ${revision.resolverVersion} / policy ${revision.accountingPolicyVersion}`; history.appendChild(p); });
      details.append(heading, note, warning, form, balance, resolve, history); validate();
    };

    const load = async () => {
      grids = []; sections.replaceChildren(); details.innerHTML = "<h3>Resolution details</h3><p>Select a trade to inspect or allocate it.</p>";
      message.textContent = "Reading correlated canonical trade evidence...";
      try {
        dashboard = await TradeResolutions.dashboard();
        summary.replaceChildren(...Object.entries(dashboard.summary).map(([key, value]) => { const card = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = number(value); const span = document.createElement("span"); span.textContent = key.replace(/([A-Z])/g, " $1").replace(/^\w/, (letter) => letter.toUpperCase()); card.append(strong, span); return card; }));
        const readyRows = [...dashboard.automaticCandidates.map((trade) => tradeRow(trade, "Automatic")), ...dashboard.ready.map((trade) => tradeRow(trade, "Manual allocation required"))];
        sections.append(
          section("Ready to Resolve", readyRows, (row) => void editor(row.source), "No unresolved eligible trades."),
          section("Automatically Resolved", dashboard.automaticallyResolved.map((resolution) => resolutionRow(resolution, `v${resolution.resolutionVersion} · Automatic`)), (row) => void editor(null, row.source), "No automatically resolved trades."),
          section("Resolved", dashboard.resolved.filter((resolution) => resolution.resolutionMethod !== "automatic_single_item").map((resolution) => resolutionRow(resolution, `v${resolution.resolutionVersion} · Manual`)), (row) => void editor(null, row.source), "No manually resolved trades."),
          section("Needs Review", dashboard.needsReview.map((resolution) => resolutionRow(resolution, `v${resolution.resolutionVersion} · Needs review`)), (row) => void editor(null, row.source), "No resolutions need review."),
        );
        message.textContent = `Found ${number(dashboard.summary.eligible)} eligible completed cash-for-items trades.`; message.className = "tct-purchases__message success";
      } catch (error) { message.textContent = `Trade Resolver unavailable: ${error.message}`; message.className = "tct-purchases__message error"; }
    };
    scan.addEventListener("click", async () => {
      scan.disabled = true; message.textContent = "Resolving eligible single-item trades...";
      try {
        const results = await TradeResolutions.resolveAutomaticCandidates();
        message.textContent = `${number(results.filter((result) => result.created).length)} automatic Trade Resolutions created. Rebuild Projection, Ledger, Cost Lots, FIFO, and Inventory Position.`;
        message.className = "tct-purchases__message success"; await load();
      } catch (error) { message.textContent = `Automatic resolution failed: ${error.message}`; message.className = "tct-purchases__message error"; }
      finally { scan.disabled = false; }
    });
    await ItemCatalogService.ensureLoaded().catch(() => null);
    await load();
  },
  destroy(){ grids = []; },
};
