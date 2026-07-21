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
import { RawLogExporter, validateExportFilters } from "../services/history/raw-log-export-service.js";

function formatArchiveTime(timestamp){
  return timestamp ? new Date(Number(timestamp) * 1000).toLocaleString() : "Not archived yet";
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
