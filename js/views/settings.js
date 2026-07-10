/**
 * Settings view.
 */
import { Events } from "../events.js";
import { Settings } from "../settings.js";
import { PlayerStore } from "../stores/player.js";

export default {
  route: "settings",
  title: "Settings",

  render(){
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
        href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&amp;user=basic,bazaar,display,profile,inventory,itemmarket&amp;market=itemmarket,bazaar&amp;torn=items&amp;title=Torn%20Cost%20Tracker%20alpha1"
        target="_blank"
        rel="noopener noreferrer"
      >Generate API Key</a>
      <div style="display:flex;gap:10px;">
        <button id="saveBtn" class="api-key-save">Save</button>
      </div>
      <div id="settingsMessage" class="settings-message" aria-live="polite"></div>
    `;
    return card;
  },

  async mount(){
    const apiKeyInput = document.getElementById("apiKey");
    const saveButton = document.getElementById("saveBtn");
    const message = document.getElementById("settingsMessage");
    apiKeyInput.value = Settings.load().apiKey ?? "";

    const saveAndRefresh = async () => {
      Settings.save({ apiKey: apiKeyInput.value.trim() });
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
      message.className = "settings-message";
      message.textContent = "Saving API key...";

      try{
        const player = await PlayerStore.refresh();
        Events.emit("connectionChanged", { player });
        message.classList.add("settings-message--success");
        message.textContent = "API key successfully saved.";
      }catch(error){
        console.error("Unable to refresh player profile after saving API key:", error);
        Events.emit("connectionChanged", { player: null });
        message.classList.add("settings-message--error");
        message.textContent = `Unable to validate API key: ${error.message}`;
      }finally{
        saveButton.disabled = false;
        saveButton.textContent = "Save";
      }
    };

    saveButton.addEventListener("click", () => {
      void saveAndRefresh();
    });
  },
};
