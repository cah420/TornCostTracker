import assert from "node:assert/strict";

class FakeClassList {
  constructor(){ this.values = new Set(); }
  toggle(name, force){ force ? this.values.add(name) : this.values.delete(name); }
  contains(name){ return this.values.has(name); }
}

class FakeToggle {
  constructor(){ this.attributes = new Map(); this.listeners = new Map(); }
  setAttribute(name, value){ this.attributes.set(name, String(value)); }
  getAttribute(name){ return this.attributes.get(name); }
  addEventListener(name, callback){ this.listeners.set(name, callback); }
}

globalThis.localStorage = {
  values: new Map(),
  getItem(key){ return this.values.get(key) ?? null; },
  setItem(key, value){ this.values.set(key, value); },
  removeItem(key){ this.values.delete(key); },
  clear(){ this.values.clear(); },
};

const { SIDEBAR_PREFERENCE_KEY, initializeSidebarToggle } = await import("./sidebar-controller.js");
const root = { classList: new FakeClassList() };
const toggle = new FakeToggle();

initializeSidebarToggle({ root, toggle });
assert.equal(root.classList.contains("sidebar-collapsed"), false);
assert.equal(toggle.getAttribute("aria-expanded"), "true");
assert.equal(toggle.getAttribute("aria-label"), "Collapse sidebar");

toggle.listeners.get("click")();
assert.equal(root.classList.contains("sidebar-collapsed"), true);
assert.equal(toggle.getAttribute("aria-expanded"), "false");
assert.equal(toggle.getAttribute("aria-label"), "Expand sidebar");
assert.equal(localStorage.getItem(SIDEBAR_PREFERENCE_KEY), "true");

const restoredRoot = { classList: new FakeClassList() };
const restoredToggle = new FakeToggle();
initializeSidebarToggle({ root: restoredRoot, toggle: restoredToggle });
assert.equal(restoredRoot.classList.contains("sidebar-collapsed"), true);
assert.equal(restoredToggle.getAttribute("aria-expanded"), "false");

console.log("Sidebar controller deterministic tests passed.");
