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
        href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=Torn%20Cost%20Tool%20v060alpha3&user=basic,bazaar,display,profile,inventory,itemmarket,log&market=itemmarket,bazaar&torn=items"
        target="_blank"
        rel="noopener noreferrer"
      >Generate API Key</a>
      <div style="display:flex;gap:10px;">
        <button id="saveBtn" class="api-key-save">Save</button>
      </div>
      <div id="settingsMessage" class="settings-message" aria-live="polite"></div>
      <section class="settings-purchase-cache">
        <h3>Purchase cache</h3>
        <p>Clear locally saved purchase history and purchase-sync checkpoints for every cached account on this device.</p>
        <button id="clearPurchaseCacheBtn" class="settings-danger-button" type="button">Clear Purchase Cache</button>
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
    apiKeyInput.value = Settings.load().apiKey ?? "";

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
          <p>This clears all locally cached purchase history and sync checkpoints. This action cannot be undone.</p>
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
};
