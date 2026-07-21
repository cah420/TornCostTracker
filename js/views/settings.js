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

function formatArchiveTime(timestamp){
  return timestamp ? new Date(Number(timestamp) * 1000).toLocaleString() : "Not archived yet";
}
let archiveProgressListener = null;

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
    archiveProgressListener = (update) => {
      if (!RawLogs.active) return;
      archiveStatus.textContent = `Raw log import ${update.status}: ${update.logsInserted ?? 0} stored, ${update.duplicates ?? 0} duplicates, ${update.conflicts ?? 0} conflicts, ${update.pagesFetched ?? 0} pages.`;
    };
    Events.on("rawLogImportProgress", archiveProgressListener);
    void refreshArchive().catch((error) => { archiveStatus.textContent = `SQLite archive unavailable: ${error.message}`; setArchiveControls(false, false); });

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
    archiveProgressListener = null;
  },
};
