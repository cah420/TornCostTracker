/**
 * settings.js
 *
 * Settings View
 */

import { Settings } from "../settings.js";
import { API } from "../api.js";
import { Events } from "../events.js";

export default {
  route: "settings",

  title: "Settings",

  render() {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
            <h2>Settings</h2>

            <label for="apiKey">
                Full Torn API Key
            </label>

            <br>

            <input
                id="apiKey"
                type="password"
                style="width:100%;margin:10px 0;padding:8px;"
            >

            <div style="display:flex;gap:10px;">

                <button id="saveBtn">
                    Save
                </button>

                <button id="testBtn">
                    Test Connection
                </button>

            </div>

            <div id="settingsStatus" style="margin-top:20px;">

                Not Connected

            </div>
        `;

    return card;
  },

  async mount() {
    const settings = Settings.load();

    const apiKeyInput = document.getElementById("apiKey");
    const status = document.getElementById("settingsStatus");

    apiKeyInput.value = settings.apiKey ?? "";

    document.getElementById("saveBtn").addEventListener("click", () => {
      Settings.save({
        apiKey: apiKeyInput.value.trim(),
      });

      status.textContent = "Settings saved.";
    });

    document.getElementById("testBtn").addEventListener("click", async () => {
      Settings.save({
        apiKey: apiKeyInput.value.trim(),
      });

      status.textContent = "Testing connection...";

      try {
        const result = await API.testConnection();

        const { player } = result;

        status.innerHTML = `
                    <strong style="color:#22c55e;">
                        ✓ Connected
                    </strong>

                    <br><br>

                    <img
                        src="${player.avatar}"
                        alt="${player.name}"
                        style="
                            width:64px;
                            height:64px;
                            border-radius:8px;
                            margin-bottom:10px;
                        "
                    >

                    <br>

                    <strong>${player.name}</strong>

                    <br>

                    ID: ${player.id}

                    <br>

                    Level ${player.level} ${player.rank}
                `;

        Events.emit("connectionChanged", { player: result.player });
      } catch (error) {
        status.innerHTML = `
                    <span style="color:#ef4444;">
                        Connection failed
                    </span>

                    <br><br>

                    ${error.message}
                `;

        Events.emit("connectionChanged", { player: null });
      }
    });
  },

  async destroy() {
    // Cleanup will go here later.
  },
};
