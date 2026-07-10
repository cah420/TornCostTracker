export default {
    route: "settings",
    title: "Settings",

    async init() {
        // Runs before rendering
    },

    render() {
        const card = document.createElement("div");
        card.className = "card";

        const h2 = document.createElement("h2");
        h2.textContent = "Settings";

        const p = document.createElement("p");
        p.textContent = "Configure API keys and application settings here.";

        card.append(h2, p);

        return card;
    },

    async mount() {
        // Runs after render
    },

    async destroy() {
        // Cleanup timers/listeners here later
    }
};
