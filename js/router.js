export const pages = {
  dashboard: `
        <div class="card">
            <h2>Dashboard</h2>
            <p>Welcome to Torn Cost Tracker.</p>
            <p>The dashboard widgets will appear here in later milestones.</p>
        </div>
    `,

  inventory: `
        <div class="card">
            <h2>Inventory</h2>
            <p>Inventory tools coming soon.</p>
        </div>
    `,

  purchases: `
        <div class="card">
            <h2>Purchases</h2>
            <p>Purchase history viewer coming soon.</p>
        </div>
    `,

  statistics: `
        <div class="card">
            <h2>Statistics</h2>
            <p>Charts and analytics coming soon.</p>
        </div>
    `,

  settings: `
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
    `,
};
