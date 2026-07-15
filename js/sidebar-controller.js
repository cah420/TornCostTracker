import { Storage } from "./storage.js";

export const SIDEBAR_PREFERENCE_KEY = "tct.ui.sidebarCollapsed";

function updateToggle(toggle, collapsed){
  toggle.setAttribute("aria-expanded", String(!collapsed));
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
}

export function applySidebarState(collapsed, {
  root = document.body,
  toggle = document.getElementById("sidebarToggle"),
} = {}){
  root.classList.toggle("sidebar-collapsed", Boolean(collapsed));
  if (toggle) updateToggle(toggle, Boolean(collapsed));
}

export function initializeSidebarToggle({
  root = document.body,
  toggle = document.getElementById("sidebarToggle"),
} = {}){
  const collapsed = Storage.load(SIDEBAR_PREFERENCE_KEY, false) === true;
  applySidebarState(collapsed, { root, toggle });
  if (!toggle) return collapsed;

  toggle.addEventListener("click", () => {
    const next = !root.classList.contains("sidebar-collapsed");
    applySidebarState(next, { root, toggle });
    Storage.save(SIDEBAR_PREFERENCE_KEY, next);
  });
  return collapsed;
}
