export default {
    route: "dashboard",
    title: "Dashboard",

    async init() {
        // Runs before rendering
    },

    render() {
        const card = document.createElement("div");
        card.className = "card";

        const h2 = document.createElement("h2");
        h2.textContent = "Dashboard";

        const p = document.createElement("p");
        p.textContent = "Welcome to Torn Cost Tracker.";

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
