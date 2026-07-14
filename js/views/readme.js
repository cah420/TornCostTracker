import { readmeUrl, renderMarkdown } from "../services/markdown-renderer.js";

let cachedReadme = null;

async function loadReadme({ reload = false } = {}){
  if (cachedReadme !== null && !reload) return cachedReadme;
  const response = await fetch(readmeUrl(), { cache: reload ? "reload" : "default" });
  if (!response.ok) throw new Error(`README request failed (${response.status}).`);
  cachedReadme = await response.text();
  return cachedReadme;
}

function createState(message, className = ""){
  const state = document.createElement("p");
  state.className = `tct-readme__state ${className}`.trim();
  state.textContent = message;
  return state;
}

export default {
  route: "readme",
  title: "Readme",

  render(){
    const card = document.createElement("article");
    card.className = "card tct-readme";
    card.append(createState("Loading README...", "tct-readme__state--loading"));
    return card;
  },

  async mount(){
    const container = document.querySelector(".tct-readme");
    if (!container) return;
    const display = async ({ reload = false } = {}) => {
      container.replaceChildren(createState(reload ? "Reloading README..." : "Loading README...", "tct-readme__state--loading"));
      try {
        const markdown = await loadReadme({ reload });
        const content = document.createElement("div");
        content.className = "tct-readme__content";
        content.append(renderMarkdown(markdown, { baseUrl: new URL("./", window.location.href).href }));
        container.replaceChildren(content);
      } catch (error) {
        console.warn("Unable to load README:", error);
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "tct-readme__retry";
        retry.textContent = "Retry";
        retry.addEventListener("click", () => { void display({ reload: true }); });
        container.replaceChildren(
          createState("Unable to load the README. Serve the app through Live Server or open its hosted GitHub Pages site, then try again.", "tct-readme__state--error"),
          retry,
        );
      }
    };
    await display();
  },
};
