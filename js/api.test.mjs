import assert from "node:assert/strict";

const settings = new Map([["tct.settings", JSON.stringify({ apiKey: "test-key" })]]);
globalThis.localStorage = {
  getItem: (key) => settings.get(key) ?? null,
  setItem: (key, value) => settings.set(key, String(value)),
  removeItem: (key) => settings.delete(key),
  clear: () => settings.clear(),
};

const { API, setTornRequestQueueForTesting, resetTornRequestQueueForTesting } = await import("./api.js");
const calls = [];
globalThis.fetch = async (requestUrl) => {
  calls.push(String(requestUrl));
  return { ok: true, status: 200, json: async () => ({}) };
};

const sharedQueue = {
  calls: 0,
  async enqueue(task) {
    this.calls += 1;
    return task();
  },
};
setTornRequestQueueForTesting(sharedQueue);
await API.getInventoryPage("Melee");
await API.getBazaarPage();
assert.equal(sharedQueue.calls, 2, "v1 and v2 requests enter the same queue");
assert.match(calls[0], /^https:\/\/api\.torn\.com\/v2\/user\/inventory/);
assert.match(calls[1], /^https:\/\/api\.torn\.com\/user\/\?selections=bazaar/);
resetTornRequestQueueForTesting();
console.log("API shared-queue coverage tests passed.");
