import { DataGrid } from "../components/data-grid.js";
import { ItemCatalogService } from "../services/item-catalog-service.js";
import { ItemCatalogStore } from "../stores/item-catalog.js";
import { DisposalResolutions } from "../services/history/disposal-resolution-service.js";

let grids = [];
function money(value){ return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0); }
function date(value){ return value ? new Date(Number(value) * 1000).toLocaleString() : "—"; }
function number(value){ return new Intl.NumberFormat().format(Number(value) || 0); }
function names(groups){ return groups.map((group) => `${number(group.quantity)} × ${ItemCatalogStore.nameFor(group.itemId) ?? `Item #${group.itemId}`}${group.uids?.length ? ` (${group.uids.length} UIDs)` : ""}`).join(", "); }
function tradeRow(trade, status){ return { id: trade.tradeId, transactionId: trade.tradeId, timestamp: trade.timestamp, counterpartyId: trade.counterpartyId ?? "Unknown", proceeds: trade.cashReceived, items: names(trade.sentItemGroups), status, source: trade }; }
function resolutionRow(resolution, status){ return { id: resolution.id, transactionId: resolution.sourceTransactionId, timestamp: resolution.transactionTimestamp, counterpartyId: resolution.counterpartyId ?? "Unknown", proceeds: resolution.totalNetProceeds, items: names(resolution.allocations), status, source: resolution }; }
function section(title, rows, onClick, emptyMessage){
  const wrapper = document.createElement("section"); wrapper.className = "tct-trade-resolver__section";
  const heading = document.createElement("h3"); heading.textContent = title; const host = document.createElement("div");
  const grid = new DataGrid({
    columns: [
      { label: "Disposal Date", key: "timestamp", type: "number", defaultSort: true, format: date },
      { label: "Source", key: "sourceType", value: () => "Trade" },
      { label: "Counterparty", key: "counterpartyId" },
      { label: "Net Proceeds", key: "proceeds", type: "number", format: money },
      { label: "Items Sent", key: "items" },
      { label: "Status", key: "status" },
    ],
    rows, rowKey: "id", onRowClick: onClick, storageKey: `tct.grid.disposal-resolver.${title.toLocaleLowerCase().replaceAll(" ", "-")}`, emptyMessage,
  });
  grids.push(grid); host.appendChild(grid.element); wrapper.append(heading, host); return wrapper;
}

export default {
  route: "disposal-resolver",
  title: "Disposal Resolver",
  render(){
    const card = document.createElement("div"); card.className = "card tct-trade-resolver";
    card.innerHTML = `<div class="tct-trade-resolver__heading"><div><h2>Disposal Resolver</h2><p>Resolve completed items-for-cash trades into versioned canonical disposals.</p></div><button id="resolveEligibleDisposals" class="tct-purchases__button" type="button">Scan & Resolve Eligible Sales</button></div><p id="disposalResolverMessage" class="tct-purchases__message" aria-live="polite"></p><div id="disposalResolverSummary" class="tct-trade-resolver__summary"></div><div id="disposalResolverSections"></div><section id="disposalResolverDetails" class="tct-trade-resolver__details"><h3>Resolution details</h3><p>Select a sale to inspect or allocate it.</p></section>`;
    return card;
  },
  async mount(){
    const message = document.getElementById("disposalResolverMessage"); const summary = document.getElementById("disposalResolverSummary");
    const sections = document.getElementById("disposalResolverSections"); const details = document.getElementById("disposalResolverDetails"); const scan = document.getElementById("resolveEligibleDisposals");
    let dashboard = null;
    const editor = async (source, existing = null) => {
      const trade = existing ? dashboard.trades.find((entry) => entry.tradeId === existing.sourceTransactionId) : source;
      if (!trade) { details.innerHTML = "<h3>Resolution details</h3><p>The correlated disposal evidence is unavailable.</p>"; return; }
      const history = existing ? await DisposalResolutions.history(existing.sourceTransactionId) : [];
      details.replaceChildren();
      const heading = document.createElement("h3"); heading.textContent = `Trade ${trade.tradeId}`;
      const note = document.createElement("p"); note.textContent = `${date(trade.timestamp)} · Counterparty ${trade.counterpartyId ?? "Unknown"} · Net proceeds ${money(trade.cashReceived)}`;
      const warning = document.createElement("p"); warning.className = "tct-purchases__message warning"; warning.textContent = existing ? `Editing creates resolution version ${existing.resolutionVersion + 1} and requires rebuilding Projection, Ledger, Cost Lots, FIFO, and Inventory Position.` : trade.sentItemGroups.length === 1 ? "This sale is eligible for automatic single-item resolution." : "Allocate all proceeds across every canonical Item ID.";
      const form = document.createElement("div"); form.className = "tct-trade-resolver__allocations";
      const existingTotals = new Map((existing?.allocations ?? []).map((allocation) => [String(allocation.itemId), allocation.totalProceeds]));
      const rows = trade.sentItemGroups.map((group) => {
        const row = document.createElement("div"); row.className = "tct-trade-resolver__allocation";
        const item = document.createElement("strong"); item.textContent = `${ItemCatalogStore.nameFor(group.itemId) ?? `Item #${group.itemId}`} [${group.itemId}]`;
        const quantity = document.createElement("span"); quantity.textContent = `Quantity ${number(group.quantity)} · UID count ${number(group.uids.length)}`;
        const label = document.createElement("label"); label.textContent = "Allocated Net Proceeds";
        const total = document.createElement("input"); total.type = "number"; total.min = "0"; total.step = "1"; total.value = String(existingTotals.get(group.itemId) ?? (trade.sentItemGroups.length === 1 ? trade.cashReceived : 0));
        total.addEventListener("input", validate); row.append(item, quantity, label, total); form.appendChild(row); return { group, total };
      });
      const balance = document.createElement("p"); const resolve = document.createElement("button"); resolve.type = "button"; resolve.className = "tct-purchases__button"; resolve.textContent = existing ? "Create New Resolution Revision" : "Resolve Sale";
      function validate(){
        const allocated = rows.reduce((sum, row) => sum + (Number(row.total.value) || 0), 0);
        const valid = rows.every((row) => Number.isInteger(Number(row.total.value)) && Number(row.total.value) >= 0) && allocated === trade.cashReceived;
        balance.textContent = `Allocated ${money(allocated)} of ${money(trade.cashReceived)}${valid ? " · Balanced" : " · Must balance before resolving"}`;
        balance.className = `tct-purchases__message ${valid ? "success" : "warning"}`; resolve.disabled = !valid;
      }
      resolve.addEventListener("click", async () => {
        resolve.disabled = true;
        try {
          const result = await DisposalResolutions.resolve(trade.tradeId, rows.map((row) => ({ itemId: row.group.itemId, totalProceeds: Number(row.total.value) })), "manual_multi_item");
          message.textContent = result.created ? `Disposal Resolution v${result.resolution.resolutionVersion} saved. Downstream rebuilds are required.` : "The active resolution is already materially identical.";
          message.className = "tct-purchases__message success"; await load();
        } catch (error) { balance.textContent = error.message; balance.className = "tct-purchases__message error"; resolve.disabled = false; }
      });
      const revisions = document.createElement("details"); const revisionsSummary = document.createElement("summary"); revisionsSummary.textContent = `Revision history (${history.length})`; revisions.appendChild(revisionsSummary);
      history.forEach((revision) => { const row = document.createElement("p"); row.textContent = `v${revision.resolutionVersion} · ${revision.status} · ${revision.resolutionMethod} · resolver ${revision.resolverVersion} / policy ${revision.accountingPolicyVersion}`; revisions.appendChild(row); });
      details.append(heading, note, warning, form, balance, resolve, revisions); validate();
    };
    const load = async () => {
      grids = []; sections.replaceChildren(); details.innerHTML = "<h3>Resolution details</h3><p>Select a sale to inspect or allocate it.</p>"; message.textContent = "Reading correlated disposal evidence...";
      try {
        dashboard = await DisposalResolutions.dashboard();
        summary.replaceChildren(...Object.entries(dashboard.summary).map(([key, value]) => { const card = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = number(value); const span = document.createElement("span"); span.textContent = key.replace(/([A-Z])/g, " $1").replace(/^\w/, (letter) => letter.toUpperCase()); card.append(strong, span); return card; }));
        const ready = [...dashboard.automaticCandidates.map((trade) => tradeRow(trade, "Automatic")), ...dashboard.ready.map((trade) => tradeRow(trade, "Manual allocation required"))];
        sections.append(
          section("Ready to Resolve", ready, (row) => void editor(row.source), "No unresolved eligible disposal trades."),
          section("Automatically Resolved", dashboard.automaticallyResolved.map((resolution) => resolutionRow(resolution, `v${resolution.resolutionVersion} · Automatic`)), (row) => void editor(null, row.source), "No automatically resolved sales."),
          section("Resolved", dashboard.resolved.filter((resolution) => resolution.resolutionMethod !== "automatic_single_item").map((resolution) => resolutionRow(resolution, `v${resolution.resolutionVersion} · Manual`)), (row) => void editor(null, row.source), "No manually resolved sales."),
          section("Needs Review", dashboard.needsReview.map((resolution) => resolutionRow(resolution, `v${resolution.resolutionVersion} · Needs review`)), (row) => void editor(null, row.source), "No disposal resolutions need review."),
        );
        message.textContent = `Found ${number(dashboard.summary.eligible)} eligible completed items-for-cash trades.`; message.className = "tct-purchases__message success";
      } catch (error) { message.textContent = `Disposal Resolver unavailable: ${error.message}`; message.className = "tct-purchases__message error"; }
    };
    scan.addEventListener("click", async () => {
      scan.disabled = true; message.textContent = "Resolving eligible single-item sales...";
      try { const results = await DisposalResolutions.resolveAutomaticCandidates(); message.textContent = `${number(results.filter((result) => result.created).length)} automatic Disposal Resolutions created. Rebuild downstream accounting.`; message.className = "tct-purchases__message success"; await load(); }
      catch (error) { message.textContent = `Automatic disposal resolution failed: ${error.message}`; message.className = "tct-purchases__message error"; }
      finally { scan.disabled = false; }
    });
    await ItemCatalogService.ensureLoaded().catch(() => null); await load();
  },
  destroy(){ grids = []; },
};
