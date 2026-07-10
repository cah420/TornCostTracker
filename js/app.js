import { pages } from "./router.js";
import { loadPage } from "./ui.js";
import { initializeSettings } from "./settings.js";

function show(page) {
  loadPage(pages[page]);

  if (page === "settings") {
    initializeSettings();
  }

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.remove("active");

    if (button.dataset.page === page) {
      button.classList.add("active");
    }
  });
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.onclick = () => {
    show(button.dataset.page);
  };
});

show("dashboard");
