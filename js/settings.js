import { toast } from "./ui.js";

export function initializeSettings() {
  const button = document.getElementById("saveSettings");

  if (!button) return;

  const input = document.getElementById("apiKey");

  input.value = localStorage.getItem("apiKey") ?? "";

  button.onclick = () => {
    localStorage.setItem("apiKey", input.value.trim());

    toast("Settings saved.");
  };
}
