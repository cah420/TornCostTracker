export function render() {
  return `
        <div class="card">
            <h2>Settings</h2>

            <label>
                Torn API Key
            </label>

            <br><br>

            <input
                id="apiKey"
                style="width:100%;padding:12px;border-radius:8px;"
                placeholder="Enter your Torn API key">

            <br><br>

            <button id="saveSettings">
                Save
            </button>

        </div>
    `;
}
