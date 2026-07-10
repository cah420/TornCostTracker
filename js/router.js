import { Events } from "./events.js";

const routes = new Map();
let current = null;

export const Router = {

    register(view) {
        routes.set(view.route, view);
    },

    list() {
        return [...routes.keys()];
    },

    current() {
        return current?.route ?? null;
    },

    async navigate(route) {
        const next = routes.get(route);

        if (!next) {
            console.error(`Unknown route: ${route}`);
            return;
        }

        if (current?.destroy) {
            await current.destroy();
        }

        if (next.init) {
            await next.init();
        }

        const content = document.getElementById("content");
        content.replaceChildren(next.render());

        if (next.mount) {
            await next.mount();
        }

        current = next;

        Events.emit("routeChanged", {
            route: next.route,
            title: next.title
        });
    }
};
