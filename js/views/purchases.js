import { DataGrid } from "../components/data-grid.js";
import { ItemCatalogService } from "../services/item-catalog-service.js";
import { PurchasesQueries } from "../services/purchases/purchases-query-service.js";

const PAGE_SIZE = 100;
let selectorGrid = null;
let lotGrid = null;
let consumptionGrid = null;
let requestTimer = null;
let selectedPositionId = null;

function money(value){
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "Not fully known"
    : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}
function date(value){ return value ? new Date(Number(value) * 1000).toLocaleString() : "—"; }
function number(value){ return new Intl.NumberFormat().format(Number(value) || 0); }
function label(value){ return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

// Retained as a pure compatibility helper for callers that filter already
// materialized display rows. SQLite-backed position search itself is queried
// through PurchasesQueryService.
export function purchaseSearchMatches(row, query){
  const normalized = String(query ?? "").trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [row.itemName, row.source, row.counterpartyId, row.tradeId, row.acquisitionId, row.itemId, row.itemUid]
    .some((value) => String(value ?? "").toLocaleLowerCase().includes(normalized));
}

function field(name, value){
  const wrapper = document.createElement("div");
  wrapper.className = "tct-purchase-position__field";
  const heading = document.createElement("strong"); heading.textContent = name;
  const content = document.createElement("span"); content.textContent = value;
  wrapper.append(heading, content);
  return wrapper;
}

function pager({ offset, limit, total }, onPage){
  const controls = document.createElement("div"); controls.className = "tct-purchases__controls";
  const text = document.createElement("span"); text.textContent = total ? `${number(offset + 1)}–${number(Math.min(offset + limit, total))} of ${number(total)}` : "0 records";
  const previous = document.createElement("button"); previous.type = "button"; previous.className = "tct-purchases__button"; previous.textContent = "Previous"; previous.disabled = offset === 0;
  const next = document.createElement("button"); next.type = "button"; next.className = "tct-purchases__button"; next.textContent = "Next"; next.disabled = offset + limit >= total;
  previous.addEventListener("click", () => onPage(Math.max(0, offset - limit)));
  next.addEventListener("click", () => onPage(offset + limit));
  controls.append(text, previous, next); return controls;
}

function detailsContent(details, loadPage){
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("h3");
  heading.textContent = `${details.itemName} · ${details.identityType}${details.itemUid ? ` ${details.itemUid}` : ""}`;
  const facts = document.createElement("div");
  facts.className = "tct-purchase-position__facts";
  const comparison = details.currentQuantityComparison;
  [
    ["Remaining quantity", number(details.remainingQuantity)],
    ["Current Torn quantity", comparison.currentTornQuantity === null ? "Unavailable" : number(comparison.currentTornQuantity)],
    ["Difference", comparison.difference === null ? "Not comparable" : number(comparison.difference)],
    ["Quantity comparison", label(comparison.state)],
    ["Known remaining quantity", number(details.knownRemainingQuantity)],
    ["Deferred quantity", number(details.deferredQuantity)],
    ["Unknown quantity", number(details.unknownQuantity)],
    ["Complete remaining basis", money(details.completeRemainingBasis)],
    ["Known remaining basis", money(details.knownRemainingBasis)],
    ["Weighted average known unit basis", money(details.weightedAverageKnownUnitBasis)],
    ["Lowest known unit basis", money(details.lowestKnownUnitBasis)],
    ["Highest known unit basis", money(details.highestKnownUnitBasis)],
    ["Basis completeness", details.basisCompleteness],
    ["Position", `${details.positionStatus} · ${details.positionHealth} · ${details.positionConfidence}% confidence`],
  ].forEach(([name, value]) => facts.appendChild(field(name, value)));
  fragment.append(heading, facts);

  const completeness = document.createElement("p");
  completeness.className = `tct-purchases__message ${details.basisCompleteness === "COMPLETE" ? "success" : "warning"}`;
  completeness.textContent = details.basisCompleteness === "COMPLETE"
    ? "All remaining quantity has known acquisition basis."
    : "Some remaining quantity has deferred or unknown basis. Cost statistics below cover known-basis quantity only.";
  fragment.appendChild(completeness);

  details.warnings.forEach((warning) => {
    const note = document.createElement("p"); note.className = "tct-purchases__message warning"; note.textContent = warning; fragment.appendChild(note);
  });
  const explanation = document.createElement("p");
  explanation.className = "tct-purchase-position__explanation";
  explanation.textContent = details.explanation?.status?.summary ?? "No position explanation is available.";
  fragment.appendChild(explanation);

  const lotsHeading = document.createElement("h4"); lotsHeading.textContent = "Cost lots"; fragment.appendChild(lotsHeading);
  lotGrid = new DataGrid({
    columns: [
      { label: "Acquired", key: "acquisitionTimestamp", type: "number", defaultSort: true, format: date },
      { label: "State", key: "lotState" },
      { label: "Source", key: "sourcePolicyCode", format: (value, row) => label(value ?? row.sourceClassification ?? "Unknown") },
      { label: "Original Qty", key: "originalQuantity", type: "number", format: number },
      { label: "Consumed", key: "consumedQuantity", type: "number", format: number },
      { label: "Remaining", key: "remainingQuantity", type: "number", format: number },
      { label: "Original Basis", key: "originalAllocatedBasis", type: "number", format: money },
      { label: "Consumed Basis", key: "consumedKnownBasis", type: "number", format: money },
      { label: "Remaining Basis", key: "remainingKnownBasis", type: "number", format: money },
      { label: "Unit Basis", key: "unitBasis", type: "number", format: money },
      { label: "Basis", key: "basisCategory", format: label },
      { label: "Lot ID", key: "lotId" },
    ],
    rows: details.remainingLots,
    storageKey: "tct.grid.purchases.lots.sort",
    emptyMessage: "No related Cost Lots were found for this position.",
  });
  const lotWrap = document.createElement("div"); lotWrap.className = "tct-purchase-position__table"; lotWrap.appendChild(lotGrid.element); fragment.appendChild(lotWrap);
  if (details.pagination) fragment.appendChild(pager({ offset: details.pagination.lotOffset, limit: details.pagination.lotLimit, total: details.pagination.lotTotal }, (offset) => loadPage(offset, details.pagination.consumptionOffset)));

  const consumptionHeading = document.createElement("h4"); consumptionHeading.textContent = "FIFO consumption history"; fragment.appendChild(consumptionHeading);
  consumptionGrid = new DataGrid({
    columns: [
      { label: "Disposed", key: "disposalTimestamp", type: "number", defaultSort: true, format: date },
      { label: "Quantity", key: "consumedQuantity", type: "number", format: number },
      { label: "Consumed Basis", key: "consumedKnownBasis", type: "number", format: money },
      { label: "Match", key: "matchType", format: label },
      { label: "Policy", key: "policyCode", format: label },
      { label: "Consumption ID", key: "consumptionId" },
    ],
    rows: details.consumptions,
    storageKey: "tct.grid.purchases.consumptions.sort",
    emptyMessage: "This position has no recorded FIFO consumption.",
  });
  const consumptionWrap = document.createElement("div"); consumptionWrap.className = "tct-purchase-position__table"; consumptionWrap.appendChild(consumptionGrid.element); fragment.appendChild(consumptionWrap);
  if (details.pagination) fragment.appendChild(pager({ offset: details.pagination.consumptionOffset, limit: details.pagination.consumptionLimit, total: details.pagination.consumptionTotal }, (offset) => loadPage(details.pagination.lotOffset, offset)));

  if (details.unassignedEvidence.length) {
    const evidence = document.createElement("details");
    const summary = document.createElement("summary"); summary.textContent = "Unassigned item-level evidence"; evidence.appendChild(summary);
    details.unassignedEvidence.forEach((row) => { const p = document.createElement("p"); p.textContent = `${label(row.reasonCode)}: ${number(row.unmatchedQuantity)} unmatched units (${number(row.occurrenceCount)} records)`; evidence.appendChild(p); });
    fragment.appendChild(evidence);
  }
  return fragment;
}

export default {
  route: "purchases",
  title: "Purchases",

  render(){
    const card = document.createElement("div");
    card.className = "card tct-purchases";
    card.innerHTML = `<h2>Purchases</h2><p class="tct-purchases__intro">Read-only remaining inventory positions derived from SQLite Cost Lots and FIFO consumption facts.</p><div id="purchaseContent"></div>`;
    return card;
  },

  async mount(){
    const content = document.getElementById("purchaseContent");
    let offset = 0;
    const controls = document.createElement("div"); controls.className = "tct-purchases__controls";
    const search = document.createElement("input"); search.type = "search"; search.placeholder = "Search item name, ID, or UID..."; search.className = "tct-purchases__search";
    const health = document.createElement("select"); health.innerHTML = `<option value="">All health</option><option>HEALTHY</option><option>WARNING</option><option>UNHEALTHY</option>`;
    const status = document.createElement("select"); status.innerHTML = `<option value="">All statuses</option><option>NORMAL</option><option>PARTIAL</option><option>DEFERRED</option><option>UNKNOWN</option><option>NEGATIVE</option><option>ERROR</option>`;
    const basis = document.createElement("select"); basis.innerHTML = `<option value="">All basis states</option><option>COMPLETE</option><option>PARTIAL</option><option>DEFERRED</option><option>UNKNOWN</option><option>NONE</option>`;
    const identity = document.createElement("select"); identity.innerHTML = `<option value="">All identities</option><option value="fungible">Fungible</option><option value="uid">UID</option>`;
    const historyLabel = document.createElement("label"); historyLabel.className = "tct-purchases__history-toggle";
    const includeConsumed = document.createElement("input"); includeConsumed.type = "checkbox";
    historyLabel.append(includeConsumed, " Include fully consumed");
    const refresh = document.createElement("button"); refresh.type = "button"; refresh.className = "tct-purchases__button"; refresh.textContent = "Refresh view";
    const previous = document.createElement("button"); previous.type = "button"; previous.className = "tct-purchases__button"; previous.textContent = "Previous";
    const next = document.createElement("button"); next.type = "button"; next.className = "tct-purchases__button"; next.textContent = "Next";
    const message = document.createElement("p"); message.className = "tct-purchases__message"; message.setAttribute("aria-live", "polite");
    const count = document.createElement("p"); count.className = "tct-purchases__count";
    const selector = document.createElement("div"); selector.className = "tct-purchases__selector";
    const details = document.createElement("section"); details.className = "tct-purchase-position"; details.innerHTML = "<h3>Position details</h3><p>Select a position to inspect remaining lots and consumption history.</p>";
    controls.append(search, health, status, basis, identity, historyLabel, refresh, previous, next);
    content.append(controls, message, count, selector, details);

    const loadDetails = async (row, lotOffset = 0, consumptionOffset = 0) => {
      selectedPositionId = row.id;
      selectorGrid.setSelectedRowKey(row.id);
      const requestId = PurchasesQueries.nextRequest("details");
      details.innerHTML = "<h3>Position details</h3><p>Loading lots and FIFO consumption...</p>";
      try {
        const result = await PurchasesQueries.getDetails(row.id, { lotOffset, consumptionOffset });
        if (!PurchasesQueries.isCurrent(requestId, "details")) return;
        details.replaceChildren(result ? detailsContent(result, (nextLotOffset, nextConsumptionOffset) => void loadDetails(row, nextLotOffset, nextConsumptionOffset)) : document.createTextNode("The selected position no longer exists."));
      } catch (error) {
        if (!PurchasesQueries.isCurrent(requestId, "details")) return;
        details.innerHTML = ""; const errorMessage = document.createElement("p"); errorMessage.className = "tct-purchases__message error"; errorMessage.textContent = `Unable to load position details: ${error.message}`; details.appendChild(errorMessage);
      }
    };

    selectorGrid = new DataGrid({
      columns: [
        { label: "Item", key: "itemName" },
        { label: "Identity", key: "identityType" },
        { label: "Remaining Qty", key: "remainingQuantity", type: "number", defaultSort: true, format: number },
        { label: "Known Basis", key: "knownRemainingBasis", type: "number", format: money },
        { label: "Basis", key: "basisCompleteness" },
        { label: "Status", key: "status" },
        { label: "Health", key: "health" },
        { label: "Confidence", key: "confidence", type: "number", format: (value) => `${value}%` },
      ],
      storageKey: "tct.grid.purchases.positions.sort",
      rowKey: "id",
      selectedRowKey: selectedPositionId,
      loading: true,
      loadingMessage: "Loading SQLite inventory positions...",
      emptyMessage: "No remaining inventory positions match these filters.",
      onRowClick: (row) => void loadDetails(row),
    });
    selector.appendChild(selectorGrid.element);

    const load = async () => {
      const requestId = PurchasesQueries.nextRequest("selector");
      selectorGrid.setLoading(true, "Loading SQLite inventory positions...");
      message.textContent = "Reading Inventory Position v1..."; message.className = "tct-purchases__message";
      try {
        const result = await PurchasesQueries.listPositions({ search: search.value, health: health.value || null, status: status.value || null, basisCompleteness: basis.value || null, identityType: identity.value || null, includeConsumed: includeConsumed.checked, limit: PAGE_SIZE, offset });
        if (!PurchasesQueries.isCurrent(requestId, "selector")) return;
        selectorGrid.setLoading(false); selectorGrid.setRows(result.rows);
        count.textContent = result.ready && result.total ? `Showing ${number(offset + 1)}–${number(Math.min(offset + result.rows.length, result.total))} of ${number(result.total)} ${includeConsumed.checked ? "accounting" : "remaining"} positions.` : result.ready ? "No accounted inventory positions match these filters." : "";
        previous.disabled = offset === 0; next.disabled = offset + result.rows.length >= result.total;
        message.textContent = result.ready ? "SQLite accounting projection ready." : result.reason;
        message.className = `tct-purchases__message ${result.ready ? "success" : "warning"}`;
      } catch (error) {
        if (!PurchasesQueries.isCurrent(requestId, "selector")) return;
        selectorGrid.setLoading(false); selectorGrid.setRows([]); count.textContent = "";
        message.textContent = `Purchases unavailable: ${error.message}`; message.className = "tct-purchases__message error";
      }
    };
    const resetAndLoad = () => { offset = 0; void load(); };
    const schedule = () => { clearTimeout(requestTimer); offset = 0; requestTimer = setTimeout(() => void load(), 250); };
    search.addEventListener("input", schedule); health.addEventListener("change", resetAndLoad); status.addEventListener("change", resetAndLoad); basis.addEventListener("change", resetAndLoad); identity.addEventListener("change", resetAndLoad); includeConsumed.addEventListener("change", resetAndLoad); refresh.addEventListener("click", () => void load());
    previous.addEventListener("click", () => { offset = Math.max(0, offset - PAGE_SIZE); void load(); });
    next.addEventListener("click", () => { offset += PAGE_SIZE; void load(); });
    void load();
    void ItemCatalogService.ensureLoaded().then(() => void load()).catch(() => null);
  },

  async destroy(){
    clearTimeout(requestTimer);
    PurchasesQueries.nextRequest("selector");
    PurchasesQueries.nextRequest("details");
    selectorGrid = null; lotGrid = null; consumptionGrid = null; selectedPositionId = null;
  },
};
