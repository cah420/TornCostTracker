/**
 * Settings view.
 */
import { Events } from "../events.js";
import { Settings } from "../settings.js";
import { PlayerStore } from "../stores/player.js";
import { PurchaseStore } from "../stores/purchases.js";
import { ItemStore } from "../stores/items.js";
import { ItemSyncService } from "../services/item-sync-service.js";
import { ItemCatalogStore } from "../stores/item-catalog.js";
import { ConversionStore } from "../stores/inventory-ledger.js";
import { Database } from "../database/database-client.js";
import { DatabaseDiagnostics } from "../database/database-diagnostics.js";
import { RawLogs } from "../services/raw-log-import-service.js";
import { CanonicalEvents } from "../services/history/canonical-event-service.js";
import { LogTypeCatalog } from "../services/history/log-type-catalog-service.js";
import { CoverageIntelligence } from "../services/history/coverage-intelligence-service.js";
import { RawLogExporter, validateExportFilters } from "../services/history/raw-log-export-service.js";
import { AccountingProjection } from "../services/history/accounting-projection-service.js";
import { AccountingLedger } from "../services/history/accounting-ledger-service.js";
import { CostLots } from "../services/history/cost-lot-service.js";
import { FifoConsumption } from "../services/history/fifo-service.js";
import { InventoryPositions } from "../services/history/inventory-position-service.js";
import { PurchasesQueries } from "../services/purchases/purchases-query-service.js";

function formatArchiveTime(timestamp){
  return timestamp ? new Date(Number(timestamp) * 1000).toLocaleString() : "Not archived yet";
}
function formatHistogram(values = {}, limit = null){
  const rows = Object.entries(values).sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]));
  return (limit ? rows.slice(0, limit) : rows).map(([name, count]) => `${name} ${count}`).join(" · ") || "None";
}
let archiveProgressListener = null;
let canonicalProgressListener = null;
let exportProgressListener = null;

export default {
  route: "settings",
  title: "Settings",

  render() {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h2>Settings</h2>
      <label for="apiKey">Limited Access Torn API Key</label>
      <input id="apiKey" type="password" style="width:100%;margin:10px 0;padding:8px;">
      <p class="api-key-help">
        A limited access key is needed. This is only saved locally to your device and is not shared.
      </p>
      <a
        class="api-key-generator"
        href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=Torn%20Cost%20Tool&user=basic,bazaar,display,profile,inventory,itemmarket,log&market=itemmarket,bazaar&torn=items"
        target="_blank"
        rel="noopener noreferrer"
      >Generate API Key</a>
      <div style="display:flex;gap:10px;">
        <button id="saveBtn" class="api-key-save">Save</button>
      </div>
      <div id="settingsMessage" class="settings-message" aria-live="polite"></div>
      <section class="settings-purchase-cache">
        <h3>Purchase cache</h3>
        <p>Clear locally saved purchase history, conversion ledger/history, and purchase-sync checkpoints for every cached account on this device.</p>
        <button id="clearPurchaseCacheBtn" class="settings-danger-button" type="button">Clear Purchase Cache</button>
      </section>
      <section class="settings-raw-log-archive">
        <h3>Raw Log Archive</h3>
        <p>Archives complete Torn log records locally in SQLite for future analysis. Archived logs are not yet interpreted for accounting, and this does not change purchase synchronization.</p>
        <div id="rawLogArchiveStatus" class="settings-archive-status" aria-live="polite">Checking SQLite archive availability...</div>
        <label for="rawLogArchiveFrom">Archive from (optional)</label>
        <input id="rawLogArchiveFrom" type="date">
        <div class="settings-archive-actions">
          <button id="startRawLogArchiveBtn" class="api-key-save" type="button">Start Historical Import</button>
          <button id="resumeRawLogArchiveBtn" type="button">Resume</button>
          <button id="incrementalRawLogArchiveBtn" type="button">Run Incremental Sync</button>
          <button id="pauseRawLogArchiveBtn" type="button">Pause</button>
          <button id="cancelRawLogArchiveBtn" type="button">Cancel</button>
          <button id="retryRawLogArchiveBtn" type="button">Retry Failed Import</button>
          <button id="refreshRawLogArchiveBtn" type="button">Refresh Diagnostics</button>
        </div>
      </section>
      <section class="settings-raw-log-archive">
        <h3>Raw Log Developer Export</h3>
        <p>Downloads selected archived source logs locally as JSON Lines for parser development. Export is read-only. Redaction reduces obvious identifiers but may not remove every sensitive value; review before sharing.</p>
        <div id="rawLogExportStatus" class="settings-archive-status" aria-live="polite">Checking export availability...</div>
        <div class="settings-export-grid">
          <label>From <input id="exportRawFrom" type="datetime-local"></label>
          <label>To <input id="exportRawTo" type="datetime-local"></label>
          <label>Log type IDs <input id="exportRawTypes" placeholder="e.g. 2405, 2340"></label>
          <label>Category <input id="exportRawCategory"></label>
          <label>Title search <input id="exportRawTitle"></label>
          <label>Source log ID <input id="exportRawSourceId"></label>
          <label>Processing <select id="exportRawProcessing"><option value="all">All</option><option value="unsupported">Unsupported</option><option value="error">Parser Errors</option></select></label>
          <label>Maximum records <input id="exportRawMaximum" type="number" min="1" placeholder="All"></label>
          <label>Order <select id="exportRawOrder"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
          <label>Examples per log type <input id="exportRawRepresentative" type="number" min="1" placeholder="Off"></label>
          <label>Redaction <select id="exportRawRedaction"><option value="redacted">Redacted (recommended)</option><option value="full">Full raw — sensitive</option></select></label>
        </div>
        <div class="settings-archive-actions">
          <button id="exportRawLogsBtn" class="api-key-save" type="button">Export JSONL</button>
          <button id="cancelRawLogExportBtn" type="button" disabled>Cancel Export</button>
          <button id="clearRawLogExportFiltersBtn" type="button">Clear Filters</button>
          <button id="countRawLogExportBtn" type="button">Refresh Match Count</button>
        </div>
      </section>
      <section class="settings-raw-log-archive">
        <h3>Canonical Event Diagnostics</h3>
        <p>Derived parser output from archived logs. These events are not yet used by purchases, FIFO, conversions, or cost basis.</p>
        <div id="canonicalEventStatus" class="settings-archive-status" aria-live="polite">Checking canonical event diagnostics...</div>
        <div class="settings-archive-actions">
          <button id="replayCanonicalEventsBtn" class="api-key-save" type="button">Replay Archived Logs</button>
          <button id="refreshCanonicalEventsBtn" type="button">Refresh Diagnostics</button>
          <button id="coverageCanonicalEventsBtn" type="button">Refresh Coverage</button>
        </div>
      </section>
      <section class="settings-raw-log-archive">
        <h3>Accounting Projection</h3>
        <p>Rebuildable developer diagnostics derived only from canonical events. This does not change Purchases, FIFO, cost lots, valuation, inventory, raw logs, or canonical events.</p>
        <div id="accountingProjectionStatus" class="settings-archive-status" aria-live="polite">Checking accounting projection...</div>
        <div class="settings-archive-actions">
          <button id="rebuildAccountingProjectionBtn" class="api-key-save" type="button">Run / Rebuild Projection</button>
          <button id="refreshAccountingProjectionBtn" type="button">Refresh Projection Diagnostics</button>
        </div>
      </section>
      <section class="settings-raw-log-archive">
        <h3>Accounting Ledger</h3>
        <p>Rebuildable, read-only double-entry diagnostics derived only from Accounting Projection. It does not change Purchases, inventory, FIFO, cost lots, valuation, canonical events, or raw logs.</p>
        <div id="accountingLedgerStatus" class="settings-archive-status" aria-live="polite">Checking accounting ledger...</div>
        <div class="settings-archive-actions">
          <button id="rebuildAccountingLedgerBtn" class="api-key-save" type="button">Rebuild Accounting Ledger</button>
          <button id="refreshAccountingLedgerBtn" type="button">Refresh Ledger Diagnostics</button>
        </div>
      </section>
      <section class="settings-raw-log-archive">
        <h3>Cost Lot Foundation</h3>
        <p>Rebuildable, read-only lot groups and acquisition lots derived only from Accounting Ledger. No lots are consumed, and this does not change current Purchases, inventory, FIFO, cost basis, or valuation.</p>
        <div id="costLotStatus" class="settings-archive-status" aria-live="polite">Checking Cost Lot diagnostics...</div>
        <div class="settings-archive-actions">
          <button id="rebuildCostLotsBtn" class="api-key-save" type="button">Run / Rebuild Cost Lots</button>
          <button id="refreshCostLotsBtn" type="button">Refresh Cost Lot Diagnostics</button>
        </div>
        <div id="costLotInspection" class="settings-catalog-results" aria-live="polite"></div>
      </section>
      <section class="settings-raw-log-archive">
        <h3>FIFO Consumption Engine</h3>
        <p>Rebuildable, read-only disposal demand and immutable FIFO allocation records derived from Accounting Ledger and Cost Lots. Original lots are never changed, and this does not replace current Purchases, inventory, legacy FIFO, cost basis, or valuation.</p>
        <div id="fifoStatus" class="settings-archive-status" aria-live="polite">Checking FIFO diagnostics...</div>
        <div class="settings-archive-actions">
          <button id="rebuildFifoBtn" class="api-key-save" type="button">Run / Rebuild FIFO</button>
          <button id="refreshFifoBtn" type="button">Refresh FIFO Diagnostics</button>
        </div>
        <div id="fifoInspection" class="settings-catalog-results" aria-live="polite"></div>
      </section>
      <section class="settings-raw-log-archive">
        <h3>Inventory Position Projection</h3>
        <p>Rebuildable, read-only historical inventory positions aggregated only from immutable Cost Lots and FIFO Consumptions. This projection is not authoritative inventory and does not change current Items, Purchases, cost basis, or valuation.</p>
        <div id="inventoryPositionStatus" class="settings-archive-status" aria-live="polite">Checking Inventory Position diagnostics...</div>
        <div class="settings-archive-actions">
          <button id="rebuildInventoryPositionBtn" class="api-key-save" type="button">Run / Rebuild Inventory Position</button>
          <button id="refreshInventoryPositionBtn" type="button">Refresh Position Diagnostics</button>
        </div>
        <div id="inventoryPositionInspection" class="settings-catalog-results" aria-live="polite"></div>
      </section>
      <section class="settings-raw-log-archive">
        <h3>Project Health &amp; Coverage Intelligence</h3>
        <p>Read-only archive, parser, replay, signature, and canonical-event measurements. These metrics guide parser work and never alter raw logs or accounting.</p>
        <div id="coverageIntelligenceStatus" class="settings-archive-status" aria-live="polite">Calculating project health...</div>
        <div class="settings-archive-actions"><button id="refreshCoverageIntelligenceBtn" type="button">Refresh Project Health</button></div>
        <div id="coverageIntelligenceRows" class="settings-catalog-results" aria-live="polite"></div>
      </section>
      <section class="settings-raw-log-archive">
        <h3>Torn Log Type Catalog &amp; Coverage</h3>
        <p>Reference catalog data from Torn is compared with locally archived logs and registered parsers. This is diagnostic-only: it does not create accounting entries or alter raw logs.</p>
        <div id="logTypeCatalogStatus" class="settings-archive-status" aria-live="polite">Checking local catalog coverage...</div>
        <div class="settings-export-grid">
          <label>Search log ID or title <input id="logTypeCatalogSearch" type="search" placeholder="e.g. 1225 or Bazaar"></label>
          <label>Status <select id="logTypeCatalogStatusFilter"><option value="all">All statuses</option><option>Supported</option><option>Partially Supported</option><option>Unsupported Observed</option><option>Awaiting Sample</option><option>Ignored</option><option>Legacy</option><option>Parser Error</option></select></label>
          <label>View <select id="logTypeCatalogView"><option value="catalog">Catalog order</option><option value="roadmap">Parser roadmap</option></select></label>
        </div>
        <div class="settings-archive-actions">
          <button id="refreshLogTypeCatalogBtn" class="api-key-save" type="button">Refresh Torn Catalog</button>
          <button id="refreshLogTypeCoverageBtn" type="button">Refresh Coverage</button>
        </div>
        <div id="logTypeCatalogRows" class="settings-catalog-results" aria-live="polite"></div>
      </section>
      <section class="settings-purchase-cache">
        <h3>Item cache</h3>
        <p>Clear locally saved owned items, the Torn item catalog, and item synchronization status. The next refresh rebuilds the cache.</p>
        <button id="clearItemCacheBtn" class="settings-danger-button" type="button">Clear Item Cache</button>
      </section>
    `;
    return card;
  },

  async mount() {
    const apiKeyInput = document.getElementById("apiKey");
    const saveButton = document.getElementById("saveBtn");
    const message = document.getElementById("settingsMessage");
    const clearPurchaseCacheButton = document.getElementById(
      "clearPurchaseCacheBtn",
    );
    const clearItemCacheButton = document.getElementById("clearItemCacheBtn");
    const archiveStatus = document.getElementById("rawLogArchiveStatus");
    const archiveFrom = document.getElementById("rawLogArchiveFrom");
    const archiveButtons = Object.fromEntries([
      "startRawLogArchiveBtn", "resumeRawLogArchiveBtn", "incrementalRawLogArchiveBtn", "pauseRawLogArchiveBtn", "cancelRawLogArchiveBtn", "retryRawLogArchiveBtn", "refreshRawLogArchiveBtn",
    ].map((id) => [id, document.getElementById(id)]));
    const canonicalStatus = document.getElementById("canonicalEventStatus");
    const replayCanonicalEventsButton = document.getElementById("replayCanonicalEventsBtn");
    const refreshCanonicalEventsButton = document.getElementById("refreshCanonicalEventsBtn");
    const coverageCanonicalEventsButton = document.getElementById("coverageCanonicalEventsBtn");
    const accountingProjectionStatus = document.getElementById("accountingProjectionStatus");
    const rebuildAccountingProjectionButton = document.getElementById("rebuildAccountingProjectionBtn");
    const refreshAccountingProjectionButton = document.getElementById("refreshAccountingProjectionBtn");
    const accountingLedgerStatus = document.getElementById("accountingLedgerStatus");
    const rebuildAccountingLedgerButton = document.getElementById("rebuildAccountingLedgerBtn");
    const refreshAccountingLedgerButton = document.getElementById("refreshAccountingLedgerBtn");
    const costLotStatus = document.getElementById("costLotStatus");
    const costLotInspection = document.getElementById("costLotInspection");
    const rebuildCostLotsButton = document.getElementById("rebuildCostLotsBtn");
    const refreshCostLotsButton = document.getElementById("refreshCostLotsBtn");
    const fifoStatus = document.getElementById("fifoStatus");
    const fifoInspection = document.getElementById("fifoInspection");
    const rebuildFifoButton = document.getElementById("rebuildFifoBtn");
    const refreshFifoButton = document.getElementById("refreshFifoBtn");
    const inventoryPositionStatus = document.getElementById("inventoryPositionStatus");
    const inventoryPositionInspection = document.getElementById("inventoryPositionInspection");
    const rebuildInventoryPositionButton = document.getElementById("rebuildInventoryPositionBtn");
    const refreshInventoryPositionButton = document.getElementById("refreshInventoryPositionBtn");
    const coverageIntelligenceStatus = document.getElementById("coverageIntelligenceStatus");
    const coverageIntelligenceRows = document.getElementById("coverageIntelligenceRows");
    const refreshCoverageIntelligenceButton = document.getElementById("refreshCoverageIntelligenceBtn");
    const logTypeCatalogStatus = document.getElementById("logTypeCatalogStatus");
    const logTypeCatalogRows = document.getElementById("logTypeCatalogRows");
    const refreshLogTypeCatalogButton = document.getElementById("refreshLogTypeCatalogBtn");
    const refreshLogTypeCoverageButton = document.getElementById("refreshLogTypeCoverageBtn");
    const logTypeCatalogSearch = document.getElementById("logTypeCatalogSearch");
    const logTypeCatalogStatusFilter = document.getElementById("logTypeCatalogStatusFilter");
    const logTypeCatalogView = document.getElementById("logTypeCatalogView");
    const exportStatus = document.getElementById("rawLogExportStatus");
    const exportButton = document.getElementById("exportRawLogsBtn");
    const cancelExportButton = document.getElementById("cancelRawLogExportBtn");
    const exportInputIds = ["exportRawFrom", "exportRawTo", "exportRawTypes", "exportRawCategory", "exportRawTitle", "exportRawSourceId", "exportRawProcessing", "exportRawMaximum", "exportRawOrder", "exportRawRepresentative", "exportRawRedaction"];
    const exportInputs = Object.fromEntries(exportInputIds.map((id) => [id, document.getElementById(id)]));
    apiKeyInput.value = Settings.load().apiKey ?? "";

    const setArchiveControls = (busy = false, available = true) => {
      ["startRawLogArchiveBtn", "resumeRawLogArchiveBtn", "incrementalRawLogArchiveBtn", "retryRawLogArchiveBtn"].forEach((id) => { archiveButtons[id].disabled = busy || !available; });
      archiveButtons.pauseRawLogArchiveBtn.disabled = !busy || !available;
      archiveButtons.cancelRawLogArchiveBtn.disabled = !busy || !available;
    };
    const refreshArchive = async () => {
      const database = await Database.initialize();
      if (!database.available) {
        archiveStatus.textContent = `SQLite archive unavailable: ${database.reason}`;
        setArchiveControls(false, false);
        return;
      }
      const info = await RawLogs.availability();
      const diagnostics = DatabaseDiagnostics.snapshot();
      const run = info.latestRun;
      archiveStatus.textContent = `SQLite: available (${diagnostics.vfs ?? "OPFS"})
Archived: ${info.archive.totalRawLogs} logs · Oldest: ${formatArchiveTime(info.archive.oldestTimestamp)} · Newest: ${formatArchiveTime(info.archive.newestTimestamp)}
Last import: ${run ? `${run.import_type} — ${run.status}` : "None"} · Pages: ${run?.pages_fetched ?? 0} · Downloaded: ${run?.logs_received ?? 0}
Stored: ${run?.logs_inserted ?? 0} · Duplicates: ${run?.duplicates_detected ?? 0} · Conflicts: ${info.archive.conflictCount} · Elapsed: ${run?.started_at && (run?.completed_at ?? run?.stopped_at) ? `${Math.round(((run.completed_at ?? run.stopped_at) - run.started_at) / 1000)}s` : "—"}
        Last checkpoint: ${(info.incrementalCheckpoint ?? info.historicalCheckpoint)?.cursor_timestamp ? formatArchiveTime((info.incrementalCheckpoint ?? info.historicalCheckpoint).cursor_timestamp) : "None"}${run?.error_summary ? `
Last error: ${run.error_summary}` : ""}`;
      setArchiveControls(false, true);
    };
    const refreshCanonicalEvents = async () => {
      const database = await Database.initialize();
      if (!database.available) {
        canonicalStatus.textContent = "Canonical event processing requires the available local SQLite archive.";
        replayCanonicalEventsButton.disabled = true;
        return;
      }
      const info = await CanonicalEvents.diagnostics();
      canonicalStatus.textContent = `Canonical events: ${info.canonicalEvents}
Processed: ${info.processed} · Unsupported: ${info.unsupported} · Parser errors: ${info.errors}
Registered parsers: ${info.parserVersions.map((parser) => `${parser.name}@${parser.version}`).join(", ") || "None"}
Persisted parser versions: ${info.persistedParserVersions.map((parser) => `${parser.parser_name}@${parser.parser_version}`).join(", ") || "None"}
Replay status: ${info.replayRunning ? "Running" : "Idle"}`;
      replayCanonicalEventsButton.disabled = info.replayRunning;
    };
    const refreshCoverage = async () => {
      const database = await Database.initialize();
      if (!database.available) return;
      const coverage = await CanonicalEvents.coverage();
      canonicalStatus.textContent = `Coverage of imported data only: ${coverage.supported}/${coverage.rows.length} supported (${coverage.percentage}%) · ${coverage.partial} partially supported · ${coverage.unsupported} unsupported\n${coverage.rows.map((row) => `${row.logTypeId} — ${row.title}: ${row.status}${row.parser ? ` (${row.parser})` : ""} · fields: ${row.payloadSignature}`).join("\n")}`;
    };
    const refreshAccountingProjection = async () => {
      const database = await Database.initialize();
      if (!database.available) { accountingProjectionStatus.textContent = "Accounting Projection requires the available local SQLite archive."; rebuildAccountingProjectionButton.disabled = true; return; }
      const diagnostics = await AccountingProjection.diagnostics(); const metrics = diagnostics.metrics;
      accountingProjectionStatus.textContent = `Health: ${diagnostics.health} · Projection version: ${diagnostics.projectionVersion}\nLatest run: ${diagnostics.latestRun ? `${diagnostics.latestRun.status} · ${metrics.canonicalEventsExamined} canonical events examined · ${metrics.durationMilliseconds}ms` : "Not run"}\nOutcomes: ${metrics.projectable} projectable · ${metrics.neutral} neutral · ${metrics.unresolved} unresolved · ${metrics.ignored} ignored · ${metrics.projectionErrors} errors\nCoverage: classification ${metrics.classificationCoveragePercent}% · safely projectable ${metrics.safelyProjectableCoveragePercent}% · accounting-ready ${metrics.accountingReadyCoveragePercent}%\nStored rows: ${diagnostics.storedProjectionRows} · Unprojected: ${metrics.unprojectedCanonicalEvents} · Reconciliation: ${metrics.reconciliationBalanced ? "balanced" : "not established"}\nClassifications: ${Object.entries(metrics.byClassification ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nUnresolved diagnostics: ${diagnostics.unresolved.length} · Projection errors: ${diagnostics.errors.length}`;
      rebuildAccountingProjectionButton.disabled = AccountingProjection.running;
    };
    const refreshAccountingLedger = async () => {
      const database = await Database.initialize();
      if (!database.available) { accountingLedgerStatus.textContent = "Accounting Ledger requires the available local SQLite archive."; rebuildAccountingLedgerButton.disabled = true; return null; }
      const diagnostics = await AccountingLedger.diagnostics(); const metrics = diagnostics.metrics;
      accountingLedgerStatus.textContent = `Health: ${diagnostics.health} · Ledger version: ${diagnostics.ledgerVersion} · Source projection version: ${diagnostics.projectionVersion}\nLatest run: ${diagnostics.latestRun ? `${diagnostics.latestRun.status} · ${metrics.projectionsExamined} projections examined · ${metrics.durationMilliseconds}ms` : "Not run"}\nDisposition: ${metrics.posted} posted · ${metrics.memorandum} memorandum · ${metrics.deferred} deferred · ${metrics.unresolved} unresolved · ${metrics.ledgerErrors} errors\nStorage: ${diagnostics.stored.transactions} transactions · ${diagnostics.stored.lines} lines · ${diagnostics.accounts.length} controlled accounts\nBalancing: ${metrics.balancedTransactions} balanced · ${metrics.unbalancedTransactions} unbalanced · debits ${metrics.totalDebits} · credits ${metrics.totalCredits}\nReconciliation: ${metrics.reconciliationBalanced ? "balanced" : "not established"} · Posted monetary coverage ${metrics.postedMonetaryCoveragePercent}% · Deferred allocation ${metrics.deferredAllocationPercent}%\nAccount balances: ${diagnostics.accountBalances.map((row) => `${row.accountCode} D${row.debits}/C${row.credits}`).join(" · ") || "No posted monetary balances"}\nDeferred: ${Object.entries(metrics.deferredReasons ?? {}).map(([reason, count]) => `${reason} ${count}`).join(" · ") || "None"}\nUnresolved: ${Object.entries(metrics.unresolvedReasons ?? {}).map(([reason, count]) => `${reason} ${count}`).join(" · ") || "None"}`;
      rebuildAccountingLedgerButton.disabled = AccountingLedger.running;
      return diagnostics;
    };
    const refreshCostLots = async () => {
      const database = await Database.initialize();
      if (!database.available) { costLotStatus.textContent = "Cost Lot Foundation requires the available local SQLite archive."; rebuildCostLotsButton.disabled = true; return null; }
      const diagnostics = await CostLots.diagnostics(); const metrics = diagnostics.metrics;
      costLotStatus.textContent = `Health: ${diagnostics.health} · Cost Lot version: ${diagnostics.costLotVersion} · Source Ledger version: ${diagnostics.sourceLedgerVersion}\nLatest run: ${diagnostics.latestRun ? `${diagnostics.latestRun.status} · ${metrics.ledgerTransactionsExamined} ledger transactions · ${metrics.durationMilliseconds}ms` : "Not run"}\nSource dispositions: ${Object.entries(metrics.byDisposition ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nStorage: ${diagnostics.stored.groups} lot groups · ${diagnostics.stored.lots} cost lots · ${diagnostics.stored.dispositions} source dispositions\nLots: ${metrics.openLots} open · ${metrics.deferredLots} deferred · ${metrics.lotsWithUid} with UID · ${metrics.lotsWithoutUid} without UID · ${metrics.lotErrors} errors\nQuantity: original ${metrics.originalQuantity} · remaining ${metrics.remainingQuantity} · consumed ${metrics.consumedQuantity} · source eligible ${metrics.eligibleSourceQuantity}\nBasis: known ${metrics.knownBasisTotal} · allocated ${metrics.allocatedBasisTotal} · unallocated ${metrics.unallocatedBasisTotal}\nCoverage: source disposition ${metrics.sourceDispositionCoveragePercent}% · inventory entry ${metrics.inventoryEntryCoveragePercent}% · basis known ${metrics.basisKnownCoveragePercent}% · fully allocated ${metrics.fullyAllocatedCoveragePercent}% · FIFO-ready ${metrics.fifoReadyCoveragePercent}% · deferred ${metrics.deferredAllocationRatePercent}%\nReconciliation: source ${metrics.sourceDispositionReconciliationBalanced ? "balanced" : "not established"} · quantity ${metrics.quantityReconciliationBalanced ? "balanced" : "not established"} · basis ${metrics.basisReconciliationBalanced ? "balanced" : "not established"}\nGroup statuses: ${Object.entries(metrics.byGroupStatus ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nLot basis statuses: ${Object.entries(metrics.byLotBasisStatus ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nLot allocation statuses: ${Object.entries(metrics.byLotAllocationStatus ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nDeferred reasons: ${Object.entries(metrics.deferredReasons ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nDiagnostics: ${Object.entries(metrics.diagnosticReasons ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nUnresolved reasons: ${Object.entries(metrics.unresolvedReasons ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nLot errors: ${Object.entries(metrics.lotErrorReasons ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}`;
      costLotInspection.textContent = `Recent Lot Groups\n${diagnostics.groups.map((group) => `${formatArchiveTime(group.eventTimestamp)} · ${group.groupType} · ${group.lotCount} lots / ${group.originalTotalQuantity} units · ${group.groupStatus} · ${group.basisStatus} · ${group.allocationStatus} · ${group.id} -> ${group.sourceLedgerTransactionId}`).join("\n") || "No lot groups stored."}\n\nRecent Cost Lots\n${diagnostics.lots.map((lot) => `${formatArchiveTime(lot.acquisitionTimestamp)} · item ${lot.itemId}${lot.itemUid ? ` · UID ${lot.itemUid}` : ""} · ${lot.originalQuantity} original / ${lot.remainingQuantity} remaining · ${lot.lotStatus} · ${lot.basisStatus} · ${lot.allocationStatus} · ${lot.allocatedBasis ?? "unknown"} basis · ${lot.id} -> ${lot.lotGroupId} -> ${lot.sourceLedgerLineId}`).join("\n") || "No cost lots stored."}\n\nLot Error Diagnostics\n${diagnostics.errors.map((row) => `${row.reasonCode} · ${row.sourceLedgerTransactionId}`).join("\n") || "No lot errors."}\n\nUnresolved Sources\n${diagnostics.unresolved.map((row) => `${row.reasonCode} · ${row.sourceLedgerTransactionId}`).join("\n") || "No unresolved sources."}`;
      rebuildCostLotsButton.disabled = CostLots.running; return diagnostics;
    };
    const refreshFifo = async () => {
      const database = await Database.initialize();
      if (!database.available) { fifoStatus.textContent = "FIFO Consumption requires the available local SQLite archive."; rebuildFifoButton.disabled = true; return null; }
      const diagnostics = await FifoConsumption.diagnostics(); const metrics = diagnostics.metrics;
      fifoStatus.textContent = `Health: ${diagnostics.health} · FIFO version: ${diagnostics.fifoVersion} · Cost Lot version: ${diagnostics.sourceCostLotVersion} · Ledger version: ${diagnostics.sourceLedgerVersion}\nLatest run: ${diagnostics.latestRun ? `${diagnostics.latestRun.status} · ${metrics.ledgerTransactionsExamined} ledger transactions · ${metrics.durationMilliseconds}ms` : "Not run"}\nSource dispositions: ${Object.entries(metrics.byDisposition ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nStorage: ${diagnostics.stored.demands} demands · ${diagnostics.stored.consumptions} consumptions · ${diagnostics.stored.dispositions} dispositions · ${diagnostics.stored.diagnostics} diagnostics\nDemand: ${metrics.disposalTransactionsEligible} transactions · ${metrics.disposalDemandsGenerated} rows · ${metrics.disposalQuantityDemanded} quantity · ${metrics.disposalQuantityMatched} matched · ${metrics.disposalQuantityUnmatched} unmatched\nLots: ${metrics.lotsTouched} touched · ${metrics.lotsFullyConsumed} fully consumed · ${metrics.lotsPartiallyConsumed} partially consumed · ${metrics.lotsUntouched} untouched · ${metrics.derivedRemainingQuantity} derived remaining\nMatches: ${metrics.exactUidMatches} exact UID / ${metrics.exactUidMatchedQuantity} quantity · ${metrics.fungibleMatches} fungible / ${metrics.fungibleMatchedQuantity} quantity\nBasis: ${metrics.knownConsumedBasis} known consumed · ${metrics.basisReadyConsumptionQuantity} basis-ready quantity · ${metrics.deferredBasisConsumptionQuantity} deferred-basis quantity\nCoverage: source ${metrics.sourceDispositionCoveragePercent}% · demand ${metrics.disposalDemandCoveragePercent}% · quantity match ${metrics.quantityMatchCoveragePercent}% · lot consumption ${metrics.lotQuantityConsumptionRatePercent}% · basis ready ${metrics.basisReadyConsumptionCoveragePercent}% · UID exact ${metrics.uidExactMatchCoveragePercent}% · historical availability ${metrics.historicalAvailabilityCoveragePercent}%\nReconciliation: source ${metrics.sourceDispositionReconciliationBalanced ? "balanced" : "failed"} · demand ${metrics.disposalDemandReconciliationBalanced ? "balanced" : "failed"} · global disposal ${metrics.globalDisposalReconciliationBalanced ? "balanced" : "failed"} · match ${metrics.matchReconciliationBalanced ? "balanced" : "failed"} · lot ${metrics.lotReconciliationBalanced ? "balanced" : "failed"} · basis ${metrics.basisReconciliationBalanced ? "balanced" : "failed"} · order ${metrics.orderingReconciliationBalanced ? "balanced" : "failed"}\nInsufficient inventory: ${Object.entries(metrics.insufficientReasons ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nUnresolved: ${Object.entries(metrics.unresolvedReasons ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}\nFIFO errors: ${Object.entries(metrics.fifoErrorReasons ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}`;
      fifoInspection.textContent = `Recent Disposal Demands\n${diagnostics.demands.map((row) => `${formatArchiveTime(row.disposalTimestamp)} · item ${row.itemId}${row.itemUid ? ` · UID ${row.itemUid}` : ""} · ${row.originalDemandQuantity} demand / ${row.matchedQuantity} matched / ${row.unmatchedQuantity} unmatched · ${row.demandStatus} · ${row.id} -> ${row.sourceLedgerTransactionId}`).join("\n") || "No FIFO demands stored."}\n\nRecent Consumptions\n${diagnostics.consumptions.map((row) => `${formatArchiveTime(row.disposalTimestamp)} · item ${row.itemId}${row.itemUid ? ` · UID ${row.itemUid}` : ""} · ${row.consumedQuantity} consumed · ${row.consumedAllocatedBasis ?? "basis deferred"} · ${row.matchType} · lot ${row.sourceLotId} -> demand ${row.disposalDemandId} -> disposal ${row.sourceDisposalLedgerTransactionId}`).join("\n") || "No FIFO consumptions stored."}\n\nDerived Lot States\n${diagnostics.lotStates.map((row) => `${formatArchiveTime(row.acquisitionTimestamp)} · item ${row.itemId}${row.itemUid ? ` · UID ${row.itemUid}` : ""} · ${row.originalQuantity} original / ${row.consumedQuantity} consumed / ${row.derivedRemainingQuantity} remaining · ${row.derivedState} · ${row.basisStatus} · ${row.sourceLotId}`).join("\n") || "No Cost Lots available."}\n\nFIFO Diagnostics\n${diagnostics.diagnostics.map((row) => `${row.diagnosticType} · ${row.reasonCode} · item ${row.itemId ?? "—"} · quantity ${row.quantityContext ?? "—"} · ${row.sourceLedgerTransactionId ?? "no source"}`).join("\n") || "No FIFO diagnostics."}`;
      rebuildFifoButton.disabled = FifoConsumption.running; return diagnostics;
    };
    const refreshInventoryPosition = async () => {
      const database = await Database.initialize();
      if (!database.available) { inventoryPositionStatus.textContent = "Inventory Position requires the available local SQLite archive."; rebuildInventoryPositionButton.disabled = true; return null; }
      const diagnostics = await InventoryPositions.diagnostics(); const metrics = diagnostics.metrics;
      inventoryPositionStatus.textContent = `Health: ${diagnostics.health} · Position version: ${diagnostics.positionVersion} · Cost Lot version: ${diagnostics.sourceCostLotVersion} · FIFO version: ${diagnostics.sourceFifoVersion} · Ledger version: ${diagnostics.sourceLedgerVersion ?? "—"} · Projection version: ${diagnostics.sourceProjectionVersion ?? "—"}
Classification calibration: ${diagnostics.classificationCalibrationAvailable ? "RC1 metrics available" : "Rebuild required for RC1 explanations and histograms"}
Latest run: ${diagnostics.latestRun ? `${diagnostics.latestRun.status} · ${metrics.lotsExamined} lots / ${metrics.consumptionsExamined} consumptions · ${metrics.durationMilliseconds}ms` : "Not run"}
Storage: ${diagnostics.stored.positions} positions · ${diagnostics.stored.diagnostics} diagnostics
Positions: ${metrics.positionsGenerated} generated · ${metrics.positionsInserted} inserted · ${metrics.existingPositions} existing · ${metrics.healthyPositions} healthy · ${metrics.warningPositions} warning · ${metrics.unhealthyPositions} unhealthy
Quantity: ${metrics.originalQuantity} original · ${metrics.consumedQuantity} consumed · ${metrics.remainingQuantity} remaining · ${metrics.knownQuantity} known · ${metrics.deferredQuantity} deferred · ${metrics.unknownQuantity} unknown
Basis: ${metrics.knownOriginalBasis} known original · ${metrics.knownConsumedBasis} known consumed · ${metrics.knownBasis} known remaining · projected total ${metrics.remainingBasis ?? "incomplete"} · ${metrics.deferredBasisPositions} positions with incomplete basis
Categories: ${metrics.fifoReadyQuantity} FIFO-ready · ${metrics.uidQuantity} UID · ${metrics.fungibleQuantity} fungible
Lot states: ${metrics.openLots} open · ${metrics.partiallyConsumedLots} partial · ${metrics.fullyConsumedLots} closed
Statuses: ${Object.entries(metrics.byStatus ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}
Health: ${Object.entries(metrics.byHealth ?? {}).map(([name, count]) => `${name} ${count}`).join(" · ") || "None"}
Confidence: average ${metrics.averageConfidence}% · median ${metrics.medianConfidence}% · range ${metrics.lowestConfidence}-${metrics.highestConfidence}%
Confidence histogram: ${Object.entries(metrics.confidenceDistribution ?? {}).map(([name, count]) => `${name}% ${count}`).join(" · ") || "None"}
Warning reasons: ${formatHistogram(metrics.warningReasonHistogram)}
Warning combinations: ${formatHistogram(metrics.warningCombinationHistogram)}
UNKNOWN reasons: ${formatHistogram(metrics.unknownReasonHistogram)}
Status reasons: ${formatHistogram(metrics.statusReasonHistogram)}
Classification rules: ${formatHistogram(metrics.classificationRuleHistogram)}
Unassigned historical evidence: ${formatHistogram(metrics.unassignedEvidenceHistogram)}
Confidence deductions: ${Object.entries(metrics.confidenceDeductionStats ?? {}).map(([name, stats]) => `${name} ${stats.occurrences} occurrences · avg -${stats.averageDeduction} · max -${stats.maximumDeduction}`).join(" · ") || "None"}
Deduction combinations: ${formatHistogram(metrics.confidenceDeductionCombinationHistogram)}
Reconciliation: quantity ${metrics.quantityReconciliationBalanced ? "balanced" : "failed"} · basis ${metrics.basisReconciliationBalanced ? "balanced" : "failed"} · lots ${metrics.lotReconciliationBalanced ? "balanced" : "failed"} · source ${metrics.sourceReconciliationBalanced ? "balanced" : "failed"} · positions ${metrics.positionReconciliationBalanced ? "balanced" : "failed"}`;
      inventoryPositionInspection.textContent = `Inventory Positions
${diagnostics.positions.map((row) => `${row.itemName} · item ${row.itemId}${row.itemUid ? ` · UID ${row.itemUid}` : " · fungible"} · ${row.originalQuantity} original / ${row.consumedQuantity} consumed / ${row.remainingQuantity} remaining · ${row.originalBasis ?? "basis incomplete"} original basis / ${row.consumedBasis ?? "basis incomplete"} consumed / ${row.remainingBasis ?? "basis incomplete"} remaining · ${row.knownQuantity} known / ${row.deferredQuantity} deferred / ${row.unknownQuantity} unknown · lots ${row.openLotCount} open / ${row.partiallyConsumedLotCount} partial / ${row.fullyConsumedLotCount} closed
  Status: ${row.explanation?.status?.value ?? row.positionStatus} — ${row.explanation?.status?.summary ?? "No explanation available."} [${row.explanation?.status?.reasons?.join(", ") || "none"}]
  Health: ${row.explanation?.health?.value ?? row.positionHealth} — ${row.explanation?.health?.summary ?? "No explanation available."} [${row.explanation?.health?.reasons?.join(", ") || "none"}]
  Confidence: ${row.positionConfidence}% · ${Object.entries(row.confidenceDeductions ?? {}).map(([reason, amount]) => `${reason} -${amount}`).join(" · ") || "no deductions"}
  Reasons: ${row.explanation?.reasons?.map((reason) => `${reason.code}: ${reason.message}`).join(" | ") || "None"}
  Trace: ${row.id} -> Cost Lots ${row.firstSourceLotId} … ${row.lastSourceLotId} -> FIFO / Ledger / Projection / Canonical references available through Position trace`).join("\n\n") || "No Inventory Positions stored."}

Position Diagnostics
${diagnostics.diagnostics.map((row) => `${row.reasonCode} · item ${row.itemId ?? "—"}${row.itemUid ? ` · UID ${row.itemUid}` : ""} · quantity ${row.supportingQuantity ?? "—"} · basis ${row.supportingBasis ?? "—"} · ${row.positionId ?? "no position"}`).join("\n") || "No Position diagnostics."}`;
      rebuildInventoryPositionButton.disabled = InventoryPositions.running; return diagnostics;
    };
    const refreshCoverageIntelligence = async () => {
      const database = await Database.initialize();
      if (!database.available) { coverageIntelligenceStatus.textContent = "Project Health requires the available local SQLite archive."; refreshCoverageIntelligenceButton.disabled = true; return; }
      const dashboard = await CoverageIntelligence.dashboard({ includeLegacyItemMarketProfile: true }); const metrics = dashboard.metrics;
      const ledger = await AccountingLedger.diagnostics();
      const costLots = await CostLots.diagnostics({ inspectionLimit: 1 });
      const fifo = await FifoConsumption.diagnostics({ inspectionLimit: 1 });
      const inventoryPosition = await InventoryPositions.diagnostics({ inspectionLimit: 1 });
      const purchasesConsumer = await PurchasesQueries.health();
      coverageIntelligenceStatus.textContent = `Health: Archive ${dashboard.health.archiveIntegrity} · Warehouse ${dashboard.health.rawWarehouse} · Replay ${dashboard.health.replay} · Coverage ${dashboard.health.coverage} · Ledger ${ledger.health} · Cost Lots ${costLots.health} · FIFO ${fifo.health} · Position ${inventoryPosition.health} · Purchases ${purchasesConsumer.healthState}`;
      const replay = dashboard.latestSnapshot?.replay;
      coverageIntelligenceRows.textContent = `Archive Overview\nObserved types: ${metrics.observedTypes} · Records: ${metrics.observedRecords} · Signatures: ${metrics.observedSignatures}\nFully supported: ${metrics.fullySupportedTypes} types / ${metrics.fullySupportedRecords} records\nPartial: ${metrics.partiallySupportedTypes} types / ${metrics.partiallySupportedRecords} records\nUnsupported: ${metrics.unsupportedTypes} types / ${metrics.unsupportedRecords} records\nSignature coverage: ${metrics.supportedSignatures}/${metrics.observedSignatures} parsed · ${metrics.unsupportedSignatures} unsupported\nCanonical events: ${metrics.canonicalEvents} across ${metrics.canonicalEventTypes} event types · Registered parsers: ${metrics.parserCount}\nLatest replay: ${replay ? `${replay.replayed} read · ${replay.generated} generated · ${replay.unsupported} unsupported · ${replay.errors} errors · ${replay.durationMilliseconds ?? "—"}ms` : "No coverage snapshot yet"}\n\nParser Families\n${dashboard.families.map((family) => `${family.family}: ${family.parserCount} parsers · ${family.observedTypes} types · ${family.observedRecords} records (${family.coveragePercent}% of archive)`).join("\n") || "No registered parser families."}\n\nHighest Impact Unsupported / Partial Types\n${dashboard.highestImpactUnsupported.map((row) => `${row.logTypeId} — ${row.title}: ${row.status} · ${row.observedCount} records · ${row.observedSignatures} signatures · ${row.family}`).join("\n") || "No unsupported observed types."}`;
      const legacyItemMarket = dashboard.legacyItemMarket;
      if (legacyItemMarket) coverageIntelligenceRows.textContent += `\n\nLegacy Item Market Purchase (1103)\nArchived: ${legacyItemMarket.totalRecords} · Accepted: ${legacyItemMarket.acceptedRecords} · Rejected: ${legacyItemMarket.rejectedRecords} · Coverage: ${legacyItemMarket.recordCoveragePercent}%\nStatus: ${legacyItemMarket.parserStatus} · Canonical events stored: ${legacyItemMarket.generatedCanonicalEvents}\nSignatures accepted/rejected: ${legacyItemMarket.acceptedSignatures.length}/${legacyItemMarket.rejectedSignatures.length} · Item rows: ${legacyItemMarket.minimumItemRows ?? "—"}-${legacyItemMarket.maximumItemRows}\nUnusual records: multiple rows ${legacyItemMarket.recordsWithMultipleItemRows} · quantity > 1 rows ${legacyItemMarket.rowsWithQuantityGreaterThanOne} · duplicate item IDs ${legacyItemMarket.recordsWithDuplicateItemIds} · duplicate UIDs ${legacyItemMarket.recordsWithDuplicateUids}\nCost: ${legacyItemMarket.minimumCost ?? "—"}-${legacyItemMarket.maximumCost ?? "—"} · invalid ${legacyItemMarket.invalidCost} · Seller missing/null: ${legacyItemMarket.sellerMissing}/${legacyItemMarket.sellerNull}${legacyItemMarket.rejectionReasons.length ? `\nRejected reasons: ${legacyItemMarket.rejectionReasons.map((reason) => `${reason.value} (${reason.count})`).join(" · ")}` : ""}`;
      coverageIntelligenceRows.textContent += `\n\nAccounting Ledger\nHealth: ${ledger.health} · Ledger v${ledger.ledgerVersion} over Projection v${ledger.projectionVersion}\nStored: ${ledger.stored.transactions} transactions · ${ledger.stored.lines} lines · ${ledger.accounts.length} controlled accounts\nLatest reconciliation: ${ledger.metrics.reconciliationBalanced ? "balanced" : "not established"} · Posted ${ledger.metrics.posted} · Deferred ${ledger.metrics.deferred} · Unresolved ${ledger.metrics.unresolved} · Errors ${ledger.metrics.ledgerErrors}`;
      coverageIntelligenceRows.textContent += `\n\nCost Lot Foundation\nHealth: ${costLots.health} · Cost Lot v${costLots.costLotVersion} over Ledger v${costLots.sourceLedgerVersion}\nStored: ${costLots.stored.groups} groups · ${costLots.stored.lots} lots · ${costLots.stored.dispositions} source dispositions\nLots: ${costLots.metrics.openLots} open · ${costLots.metrics.deferredLots} deferred · ${costLots.metrics.unresolvedTransactions} unresolved sources · ${costLots.metrics.lotErrors} errors\nReconciliation: source ${costLots.metrics.sourceDispositionReconciliationBalanced ? "balanced" : "not established"} · quantity ${costLots.metrics.quantityReconciliationBalanced ? "balanced" : "not established"} · basis ${costLots.metrics.basisReconciliationBalanced ? "balanced" : "not established"}`;
      coverageIntelligenceRows.textContent += `\n\nFIFO Consumption Engine\nHealth: ${fifo.health} · FIFO v${fifo.fifoVersion} over Cost Lot v${fifo.sourceCostLotVersion} / Ledger v${fifo.sourceLedgerVersion}\nStored: ${fifo.stored.demands} demands · ${fifo.stored.consumptions} consumptions · ${fifo.stored.dispositions} source dispositions\nQuantity: ${fifo.metrics.disposalQuantityDemanded} demanded · ${fifo.metrics.disposalQuantityMatched} matched · ${fifo.metrics.disposalQuantityUnmatched} unmatched · ${fifo.metrics.derivedRemainingQuantity} derived remaining\nReconciliation: source ${fifo.metrics.sourceDispositionReconciliationBalanced ? "balanced" : "not established"} · demand ${fifo.metrics.disposalDemandReconciliationBalanced ? "balanced" : "not established"} · match ${fifo.metrics.matchReconciliationBalanced ? "balanced" : "not established"} · lot ${fifo.metrics.lotReconciliationBalanced ? "balanced" : "not established"} · basis ${fifo.metrics.basisReconciliationBalanced ? "balanced" : "not established"} · order ${fifo.metrics.orderingReconciliationBalanced ? "balanced" : "not established"}`;
      coverageIntelligenceRows.textContent += `\n\nInventory Position Projection\nHealth: ${inventoryPosition.health} · Position v${inventoryPosition.positionVersion} over Cost Lot v${inventoryPosition.sourceCostLotVersion} / FIFO v${inventoryPosition.sourceFifoVersion}\nStored: ${inventoryPosition.stored.positions} positions · ${inventoryPosition.stored.diagnostics} diagnostics\nQuantity: ${inventoryPosition.metrics.remainingQuantity} remaining · ${inventoryPosition.metrics.knownQuantity} known · ${inventoryPosition.metrics.deferredQuantity} deferred · ${inventoryPosition.metrics.unknownQuantity} unknown\nBasis: ${inventoryPosition.metrics.knownBasis} known remaining · projected total ${inventoryPosition.metrics.remainingBasis ?? "incomplete"} · ${inventoryPosition.metrics.deferredBasisPositions} positions incomplete\nHealth: ${inventoryPosition.metrics.healthyPositions} healthy · ${inventoryPosition.metrics.warningPositions} warning · ${inventoryPosition.metrics.unhealthyPositions} unhealthy\nConfidence: average ${inventoryPosition.metrics.averageConfidence}% · median ${inventoryPosition.metrics.medianConfidence}% · range ${inventoryPosition.metrics.lowestConfidence}-${inventoryPosition.metrics.highestConfidence}% · ${Object.entries(inventoryPosition.metrics.confidenceDistribution ?? {}).map(([name, count]) => `${name}% ${count}`).join(" / ")}\nTop warnings: ${formatHistogram(inventoryPosition.metrics.warningReasonHistogram, 5)}\nTop UNKNOWN reasons: ${formatHistogram(inventoryPosition.metrics.unknownReasonHistogram, 5)}\nDeferred/unknown basis: ${inventoryPosition.metrics.warningReasonHistogram?.deferred_basis ?? 0}/${inventoryPosition.metrics.warningReasonHistogram?.unknown_basis ?? 0} · UID ambiguity ${inventoryPosition.metrics.warningReasonHistogram?.uid_ambiguity ?? 0} · Historical shortfall ${inventoryPosition.metrics.warningReasonHistogram?.historical_shortfall ?? 0}\nUnassigned historical evidence: ${formatHistogram(inventoryPosition.metrics.unassignedEvidenceHistogram, 5)}\nReconciliation: quantity ${inventoryPosition.metrics.quantityReconciliationBalanced ? "balanced" : "not established"} · basis ${inventoryPosition.metrics.basisReconciliationBalanced ? "balanced" : "not established"} · lots ${inventoryPosition.metrics.lotReconciliationBalanced ? "balanced" : "not established"} · source ${inventoryPosition.metrics.sourceReconciliationBalanced ? "balanced" : "not established"}`;
      coverageIntelligenceRows.textContent += `\n\nPurchases Read Model\nHealth: ${purchasesConsumer.healthState} · Source: SQLite Inventory Position v${purchasesConsumer.positionVersion} / Cost Lot v${purchasesConsumer.costLotVersion} / FIFO v${purchasesConsumer.fifoVersion}\nPosition run: ${purchasesConsumer.positionRunAvailable ? "available" : "missing"} · version compatibility: ${purchasesConsumer.versionCompatible ? "compatible" : "incompatible"}\nReady: ${purchasesConsumer.ready ? "yes" : "no"}${purchasesConsumer.reason ? ` · ${purchasesConsumer.reason}` : ""}\nRemaining positions: ${purchasesConsumer.remainingPositions} · incomplete basis positions: ${purchasesConsumer.incompletePositions}\nLast query: ${purchasesConsumer.lastDurationMs === null ? "not run" : `${Math.round(purchasesConsumer.lastDurationMs)}ms / ${purchasesConsumer.lastResultCount} rows`} · errors: ${purchasesConsumer.lastError ?? "none"}\nLegacy purchase-accounting cache reads: ${purchasesConsumer.legacyAccountingCacheReads}`;
      refreshCoverageIntelligenceButton.disabled = false;
    };
    const refreshLogTypeCoverage = async () => {
      const database = await Database.initialize();
      if (!database.available) {
        logTypeCatalogStatus.textContent = "Torn Log Type Catalog coverage requires the available local SQLite archive.";
        refreshLogTypeCatalogButton.disabled = true; refreshLogTypeCoverageButton.disabled = true;
        return;
      }
      const coverage = await LogTypeCatalog.coverage({ search: logTypeCatalogSearch.value, status: logTypeCatalogStatusFilter.value, view: logTypeCatalogView.value });
      const totals = coverage.totals;
      logTypeCatalogStatus.textContent = `Catalog: ${totals.catalog} types · Observed: ${totals.observedTypes} types / ${totals.observedRecords} records · Fully supported observed records: ${totals.coveragePercent}%`;
      logTypeCatalogRows.textContent = coverage.rows.map((row) => `${row.logTypeId} — ${row.title}: ${row.status} · ${row.classification} · observed ${row.observedCount}${row.lastSeen ? ` · latest ${formatArchiveTime(row.lastSeen)}` : ""}${row.parser ? ` · ${row.parser}` : ""}${row.payloadSignatures !== "none" ? ` · fields: ${row.payloadSignatures}` : ""}`).join("\n") || "No catalog entries match the selected filters. Refresh the Torn catalog to load reference data.";
      refreshLogTypeCatalogButton.disabled = false; refreshLogTypeCoverageButton.disabled = false;
    };
    const refreshTornLogTypeCatalog = async () => {
      refreshLogTypeCatalogButton.disabled = true;
      logTypeCatalogStatus.textContent = "Downloading Torn log-type catalog...";
      try {
        const result = await LogTypeCatalog.refresh();
        logTypeCatalogStatus.textContent = `Torn catalog refreshed: ${result.catalogTotal} active types · ${result.newIds} new · ${result.renamedIds} renamed · ${result.removedIds} marked inactive.`;
        await refreshLogTypeCoverage();
      } catch (error) {
        logTypeCatalogStatus.textContent = `Torn catalog refresh failed: ${error.message}`;
      } finally { refreshLogTypeCatalogButton.disabled = false; }
    };
    const exportFilters = () => validateExportFilters({
      fromTimestamp: exportInputs.exportRawFrom.value ? Math.floor(new Date(exportInputs.exportRawFrom.value).getTime() / 1000) : null,
      toTimestamp: exportInputs.exportRawTo.value ? Math.floor(new Date(exportInputs.exportRawTo.value).getTime() / 1000) : null,
      logTypeIds: exportInputs.exportRawTypes.value, category: exportInputs.exportRawCategory.value,
      titleSearch: exportInputs.exportRawTitle.value, sourceLogId: exportInputs.exportRawSourceId.value,
      processing: exportInputs.exportRawProcessing.value, maximum: exportInputs.exportRawMaximum.value,
      sortOrder: exportInputs.exportRawOrder.value, representativePerType: exportInputs.exportRawRepresentative.value,
    });
    const refreshExport = async () => {
      const database = await Database.initialize();
      if (!database.available) { exportStatus.textContent = "Developer export requires the available local SQLite archive."; exportButton.disabled = true; return; }
      try {
        const filters = exportFilters();
        const count = await RawLogExporter.count(filters);
        exportStatus.textContent = `Archived raw logs matching filters: ${count}\nFormat: JSON Lines · Redaction: ${exportInputs.exportRawRedaction.value}\nExport is read-only; application settings and API keys are never queried.`;
        exportButton.disabled = false;
      } catch (error) { exportStatus.textContent = `Export filters are invalid: ${error.message}`; exportButton.disabled = true; }
    };
    const downloadExport = (result) => {
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a"); link.href = url; link.download = result.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    };
    const confirmFullExport = async (matchingCount) => new Promise((resolve) => {
      const dialog = document.createElement("dialog"); dialog.className = "settings-confirm-dialog";
      dialog.innerHTML = `<form method="dialog" class="settings-confirm-dialog__content"><h3>Export full raw logs?</h3><p>${matchingCount} archived records match the selected filters. Full raw logs may contain private player, faction, counterparty, and free-text activity data. Review the file before sharing. This export is local and read-only.</p><label class="settings-confirm-dialog__checkbox"><input id="confirmFullRawExport" type="checkbox">I understand this export may contain sensitive data.</label><div class="settings-confirm-dialog__actions"><button value="cancel" type="submit" class="settings-confirm-dialog__cancel">Cancel</button><button id="confirmFullRawExportBtn" value="confirm" type="submit" class="settings-danger-button" disabled>Export Full Raw Logs</button></div></form>`;
      document.body.appendChild(dialog); const check = dialog.querySelector("#confirmFullRawExport"); const confirm = dialog.querySelector("#confirmFullRawExportBtn"); check.addEventListener("change", () => { confirm.disabled = !check.checked; });
      dialog.addEventListener("close", () => { resolve(dialog.returnValue === "confirm" && check.checked); dialog.remove(); }, { once: true }); dialog.showModal();
    });
    const runArchive = async (work) => {
      setArchiveControls(true, true);
      archiveStatus.textContent = "Raw log import running. Progress is retained after each committed page...";
      try { await work(); }
      catch (error) { archiveStatus.textContent = `Raw log import failed: ${error.message}`; }
      finally { await refreshArchive(); }
    };
    archiveButtons.startRawLogArchiveBtn.addEventListener("click", () => {
      const value = archiveFrom.value ? Math.floor(new Date(`${archiveFrom.value}T00:00:00`).getTime() / 1000) : null;
      void runArchive(() => RawLogs.startHistorical({ fromTimestamp: value }));
    });
    archiveButtons.resumeRawLogArchiveBtn.addEventListener("click", () => void runArchive(() => RawLogs.resumeHistorical()));
    archiveButtons.incrementalRawLogArchiveBtn.addEventListener("click", () => void runArchive(() => RawLogs.incrementalSync()));
    archiveButtons.retryRawLogArchiveBtn.addEventListener("click", () => void runArchive(() => RawLogs.retryLatest()));
    archiveButtons.pauseRawLogArchiveBtn.addEventListener("click", () => { RawLogs.pause(); archiveStatus.textContent = "Pause requested. The archive will pause after its current page commits."; });
    archiveButtons.cancelRawLogArchiveBtn.addEventListener("click", () => { RawLogs.cancel(); archiveStatus.textContent = "Cancellation requested. Archived logs will be retained."; });
    archiveButtons.refreshRawLogArchiveBtn.addEventListener("click", () => void refreshArchive());
    replayCanonicalEventsButton.addEventListener("click", () => {
      replayCanonicalEventsButton.disabled = true;
      canonicalStatus.textContent = "Replaying archived logs into derived canonical events...";
      void CanonicalEvents.replay().catch((error) => { canonicalStatus.textContent = `Canonical replay failed: ${error.message}`; }).finally(() => void refreshCanonicalEvents());
    });
    refreshCanonicalEventsButton.addEventListener("click", () => void refreshCanonicalEvents());
    coverageCanonicalEventsButton.addEventListener("click", () => void refreshCoverage().catch((error) => { canonicalStatus.textContent = `Coverage diagnostics failed: ${error.message}`; }));
    rebuildAccountingProjectionButton.addEventListener("click", () => {
      rebuildAccountingProjectionButton.disabled = true; accountingProjectionStatus.textContent = "Accounting Projection rebuild preparing...";
      void AccountingProjection.rebuild({ onProgress: (update) => { accountingProjectionStatus.textContent = `Accounting Projection ${update.status}: ${update.canonicalEventsExamined ?? 0} canonical events examined · ${update.projectable ?? 0} projectable · ${update.unresolved ?? 0} unresolved · ${update.projectionErrors ?? 0} errors`; } }).catch((error) => { accountingProjectionStatus.textContent = `Accounting Projection failed: ${error.message}`; }).finally(() => void refreshAccountingProjection());
    });
    refreshAccountingProjectionButton.addEventListener("click", () => void refreshAccountingProjection().catch((error) => { accountingProjectionStatus.textContent = `Accounting Projection unavailable: ${error.message}`; }));
    rebuildAccountingLedgerButton.addEventListener("click", () => {
      rebuildAccountingLedgerButton.disabled = true; accountingLedgerStatus.textContent = "Accounting Ledger rebuild preparing...";
      void AccountingLedger.rebuild({ onProgress: (update) => { accountingLedgerStatus.textContent = `Accounting Ledger ${update.status}: ${update.projectionsExamined ?? 0} projections · ${update.posted ?? 0} posted · ${update.deferred ?? 0} deferred · ${update.unresolved ?? 0} unresolved · ${update.ledgerErrors ?? 0} errors`; } }).catch((error) => { accountingLedgerStatus.textContent = `Accounting Ledger failed: ${error.message}`; }).finally(() => void refreshAccountingLedger());
    });
    refreshAccountingLedgerButton.addEventListener("click", () => void refreshAccountingLedger().catch((error) => { accountingLedgerStatus.textContent = `Accounting Ledger unavailable: ${error.message}`; }));
    rebuildCostLotsButton.addEventListener("click", () => {
      rebuildCostLotsButton.disabled = true; costLotStatus.textContent = "Cost Lot rebuild preparing...";
      void CostLots.rebuild({ onProgress: (update) => { costLotStatus.textContent = `Cost Lots ${update.phase}: ${update.ledgerTransactionsExamined ?? 0} ledger transactions · ${update.lotGroupsGenerated ?? 0} groups · ${update.costLotsGenerated ?? 0} lots · ${update.deferredLots ?? 0} deferred · ${update.lotErrors ?? 0} errors`; } }).catch((error) => { costLotStatus.textContent = `Cost Lot rebuild failed: ${error.message}`; }).finally(() => void refreshCostLots());
    });
    refreshCostLotsButton.addEventListener("click", () => void refreshCostLots().catch((error) => { costLotStatus.textContent = `Cost Lot diagnostics unavailable: ${error.message}`; }));
    rebuildFifoButton.addEventListener("click", () => {
      rebuildFifoButton.disabled = true; fifoStatus.textContent = "FIFO rebuild preparing...";
      void (async () => {
        try {
          await FifoConsumption.rebuild({ onProgress: (update) => { fifoStatus.textContent = `FIFO ${update.phase}: ${update.ledgerTransactionsExamined ?? 0} ledger transactions · ${update.disposalDemandsGenerated ?? 0} demands · ${update.consumptionRecordsGenerated ?? 0} consumptions · ${update.disposalQuantityUnmatched ?? 0} unmatched · ${update.fifoErrors ?? 0} errors`; } });
        } catch (error) {
          fifoStatus.textContent = `FIFO rebuild failed: ${error.message}`;
          rebuildFifoButton.disabled = FifoConsumption.running;
          return;
        }
        fifoStatus.textContent = "FIFO rebuild complete. Loading the saved summary...";
        try { await refreshFifo(); }
        catch (error) { fifoStatus.textContent = `FIFO rebuild completed, but its summary could not be loaded: ${error.message}`; }
        finally { rebuildFifoButton.disabled = FifoConsumption.running; }
      })();
    });
    refreshFifoButton.addEventListener("click", () => void refreshFifo().catch((error) => { fifoStatus.textContent = `FIFO diagnostics unavailable: ${error.message}`; }));
    rebuildInventoryPositionButton.addEventListener("click", () => {
      rebuildInventoryPositionButton.disabled = true; inventoryPositionStatus.textContent = "Inventory Position rebuild preparing...";
      void (async () => {
        try {
          await InventoryPositions.rebuild({ onProgress: (update) => { inventoryPositionStatus.textContent = `Inventory Position ${update.phase}: ${update.lotsExamined ?? 0} lots · ${update.consumptionsExamined ?? 0} consumptions · ${update.positionsGenerated ?? 0} positions · ${update.unhealthyPositions ?? 0} unhealthy`; } });
        } catch (error) {
          inventoryPositionStatus.textContent = `Inventory Position rebuild failed: ${error.message}`; rebuildInventoryPositionButton.disabled = InventoryPositions.running; return;
        }
        inventoryPositionStatus.textContent = "Inventory Position rebuild complete. Loading the saved summary...";
        try { await refreshInventoryPosition(); }
        catch (error) { inventoryPositionStatus.textContent = `Inventory Position completed, but its summary could not be loaded: ${error.message}`; }
        finally { rebuildInventoryPositionButton.disabled = InventoryPositions.running; }
      })();
    });
    refreshInventoryPositionButton.addEventListener("click", () => void refreshInventoryPosition().catch((error) => { inventoryPositionStatus.textContent = `Inventory Position diagnostics unavailable: ${error.message}`; }));
    refreshCoverageIntelligenceButton.addEventListener("click", () => void refreshCoverageIntelligence().catch((error) => { coverageIntelligenceStatus.textContent = `Project Health unavailable: ${error.message}`; }));
    refreshLogTypeCatalogButton.addEventListener("click", () => void refreshTornLogTypeCatalog());
    refreshLogTypeCoverageButton.addEventListener("click", () => void refreshLogTypeCoverage().catch((error) => { logTypeCatalogStatus.textContent = `Coverage diagnostics failed: ${error.message}`; }));
    logTypeCatalogSearch.addEventListener("input", () => void refreshLogTypeCoverage().catch(() => {}));
    logTypeCatalogStatusFilter.addEventListener("change", () => void refreshLogTypeCoverage().catch(() => {}));
    logTypeCatalogView.addEventListener("change", () => void refreshLogTypeCoverage().catch(() => {}));
    document.getElementById("countRawLogExportBtn").addEventListener("click", () => void refreshExport());
    document.getElementById("clearRawLogExportFiltersBtn").addEventListener("click", () => { exportInputIds.forEach((id) => { if (exportInputs[id].tagName === "SELECT") exportInputs[id].selectedIndex = 0; else exportInputs[id].value = ""; }); void refreshExport(); });
    exportButton.addEventListener("click", () => {
      void (async () => {
        try {
          const filters = exportFilters(); const redactionMode = exportInputs.exportRawRedaction.value;
          if (redactionMode === "full" && !(await confirmFullExport(await RawLogExporter.count(filters)))) return;
          exportButton.disabled = true; cancelExportButton.disabled = false; exportStatus.textContent = "Preparing read-only JSONL export...";
          const result = await RawLogExporter.export({ filters, redactionMode });
          if (result.status === "cancelled") exportStatus.textContent = `Export cancelled after ${result.exported} records. No archive data changed.`;
          else { downloadExport(result); exportStatus.textContent = `Exported ${result.exported} JSONL records locally. Review the file before sharing.`; }
        } catch (error) { exportStatus.textContent = `Export failed: ${error.message}`; }
        finally { cancelExportButton.disabled = true; void refreshExport(); }
      })();
    });
    cancelExportButton.addEventListener("click", () => { RawLogExporter.cancel(); cancelExportButton.disabled = true; exportStatus.textContent = "Cancellation requested; the current page will finish safely."; });
    archiveProgressListener = (update) => {
      if (!RawLogs.active) return;
      archiveStatus.textContent = `Raw log import ${update.status}: ${update.logsInserted ?? 0} stored, ${update.duplicates ?? 0} duplicates, ${update.conflicts ?? 0} conflicts, ${update.pagesFetched ?? 0} pages.`;
    };
    Events.on("rawLogImportProgress", archiveProgressListener);
    canonicalProgressListener = (update) => {
      canonicalStatus.textContent = `Canonical replay ${update.status}: ${update.replayed ?? 0} raw logs read, ${update.generated ?? 0} events generated, ${update.unsupported ?? 0} unsupported, ${update.errors ?? 0} errors.`;
    };
    Events.on("canonicalReplayProgress", canonicalProgressListener);
    exportProgressListener = (update) => { exportStatus.textContent = `Export ${update.status}: ${update.exported} of ${update.matching} matching records prepared.`; };
    Events.on("rawLogExportProgress", exportProgressListener);
    void refreshArchive().catch((error) => { archiveStatus.textContent = `SQLite archive unavailable: ${error.message}`; setArchiveControls(false, false); });
    void refreshCanonicalEvents().catch((error) => { canonicalStatus.textContent = `Canonical diagnostics unavailable: ${error.message}`; replayCanonicalEventsButton.disabled = true; });
    void refreshAccountingProjection().catch((error) => { accountingProjectionStatus.textContent = `Accounting Projection unavailable: ${error.message}`; rebuildAccountingProjectionButton.disabled = true; });
    void refreshAccountingLedger().catch((error) => { accountingLedgerStatus.textContent = `Accounting Ledger unavailable: ${error.message}`; rebuildAccountingLedgerButton.disabled = true; });
    void refreshCostLots().catch((error) => { costLotStatus.textContent = `Cost Lot diagnostics unavailable: ${error.message}`; rebuildCostLotsButton.disabled = true; });
    void refreshFifo().catch((error) => { fifoStatus.textContent = `FIFO diagnostics unavailable: ${error.message}`; rebuildFifoButton.disabled = true; });
    void refreshInventoryPosition().catch((error) => { inventoryPositionStatus.textContent = `Inventory Position diagnostics unavailable: ${error.message}`; rebuildInventoryPositionButton.disabled = true; });
    void refreshCoverageIntelligence().catch((error) => { coverageIntelligenceStatus.textContent = `Project Health unavailable: ${error.message}`; });
    void refreshLogTypeCoverage().catch((error) => { logTypeCatalogStatus.textContent = `Catalog coverage unavailable: ${error.message}`; });
    void refreshExport().catch((error) => { exportStatus.textContent = `Export unavailable: ${error.message}`; exportButton.disabled = true; });

    const saveAndRefresh = async () => {
      Settings.save({ apiKey: apiKeyInput.value.trim() });
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
      message.className = "settings-message";
      message.textContent = "Saving API key...";

      try {
        const player = await PlayerStore.refresh();
        Events.emit("connectionChanged", { player });
        message.classList.add("settings-message--success");
        message.textContent = "API key successfully saved.";
      } catch (error) {
        console.error(
          "Unable to refresh player profile after saving API key:",
          error,
        );
        Events.emit("connectionChanged", { player: null });
        message.classList.add("settings-message--error");
        message.textContent = `Unable to validate API key: ${error.message}`;
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save";
      }
    };

    saveButton.addEventListener("click", () => {
      void saveAndRefresh();
    });

    clearPurchaseCacheButton.addEventListener("click", () => {
      const dialog = document.createElement("dialog");
      dialog.className = "settings-confirm-dialog";
      dialog.innerHTML = `
        <form method="dialog" class="settings-confirm-dialog__content">
          <h3>Clear purchase cache?</h3>
          <p>This clears all locally cached purchase history, conversion ledger/history, and sync checkpoints. This action cannot be undone.</p>
          <label class="settings-confirm-dialog__checkbox">
            <input id="confirmPurchaseCacheClear" type="checkbox">
            I understand that this cannot be undone.
          </label>
          <div class="settings-confirm-dialog__actions">
            <button value="cancel" type="submit" class="settings-confirm-dialog__cancel">Cancel</button>
            <button id="confirmPurchaseCacheClearBtn" value="confirm" type="submit" class="settings-danger-button" disabled>Clear Purchase Cache</button>
          </div>
        </form>
      `;
      document.body.appendChild(dialog);

      const acknowledgement = dialog.querySelector(
        "#confirmPurchaseCacheClear",
      );
      const confirm = dialog.querySelector("#confirmPurchaseCacheClearBtn");
      acknowledgement.addEventListener("change", () => {
        confirm.disabled = !acknowledgement.checked;
      });
      dialog.addEventListener(
        "close",
        () => {
          if (dialog.returnValue === "confirm" && acknowledgement.checked) {
            PurchaseStore.clearAll();
            ConversionStore.clearAll();
            Events.emit("purchaseCacheCleared");
            message.className = "settings-message settings-message--success";
            message.textContent = "Purchase cache cleared.";
          }
          dialog.remove();
        },
        { once: true },
      );
      dialog.showModal();
    });

    clearItemCacheButton.addEventListener("click", () => {
      const dialog = document.createElement("dialog");
      dialog.className = "settings-confirm-dialog";
      dialog.innerHTML = `
        <form method="dialog" class="settings-confirm-dialog__content">
          <h3>Clear item cache?</h3>
          <p>This clears all locally cached owned items, the Torn item catalog, and item synchronization status. This action cannot be undone.</p>
          <label class="settings-confirm-dialog__checkbox">
            <input id="confirmItemCacheClear" type="checkbox">
            I understand that this cannot be undone.
          </label>
          <div class="settings-confirm-dialog__actions">
            <button value="cancel" type="submit" class="settings-confirm-dialog__cancel">Cancel</button>
            <button id="confirmItemCacheClearBtn" value="confirm" type="submit" class="settings-danger-button" disabled>Clear Item Cache</button>
          </div>
        </form>
      `;
      document.body.appendChild(dialog);

      const acknowledgement = dialog.querySelector("#confirmItemCacheClear");
      const confirm = dialog.querySelector("#confirmItemCacheClearBtn");
      acknowledgement.addEventListener("change", () => {
        confirm.disabled = !acknowledgement.checked;
      });
      dialog.addEventListener(
        "close",
        () => {
          if (dialog.returnValue === "confirm" && acknowledgement.checked) {
            ItemStore.clear();
            ItemCatalogStore.clear();
            ItemSyncService.clearState();
            Events.emit("itemCacheCleared");
            message.className = "settings-message settings-message--success";
            message.textContent = "Item cache cleared.";
          }
          dialog.remove();
        },
        { once: true },
      );
      dialog.showModal();
    });
  },

  destroy() {
    if (archiveProgressListener) Events.off("rawLogImportProgress", archiveProgressListener);
    if (canonicalProgressListener) Events.off("canonicalReplayProgress", canonicalProgressListener);
    if (exportProgressListener) Events.off("rawLogExportProgress", exportProgressListener);
    archiveProgressListener = null;
    canonicalProgressListener = null;
    exportProgressListener = null;
  },
};
