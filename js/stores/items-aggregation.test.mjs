import assert from "node:assert/strict";

globalThis.localStorage = {
  values: new Map(),
  getItem(key){ return this.values.get(key) ?? null; },
  setItem(key, value){ this.values.set(key, value); },
  removeItem(key){ this.values.delete(key); },
  clear(){ this.values.clear(); },
};

const { OwnedItem } = await import("../models.js");
const { ItemStore } = await import("./items.js");
const { CostBasisService } = await import("../services/analysis/cost-basis-service.js");
const { SnapshotService } = await import("../services/history/snapshot-service.js");
const { HistoryStore } = await import("./history.js");
const { normalizeInventoryItem } = await import("../services/importers/inventory-importer.js");
const { normalizeBazaarItem } = await import("../services/importers/bazaar-importer.js");
const { normalizeDisplayCaseItem } = await import("../services/importers/display-case-importer.js");
const { normalizeItemMarketListing } = await import("../services/importers/item-market-importer.js");

function row(id, source, quantity, name = `Item ${id}`){
  return new OwnedItem({
    id, name, locations: { [source]: quantity },
    metadata: { sources: [source] },
  });
}

function item(id){
  return ItemStore.items().find((candidate) => Number(candidate.id) === Number(id));
}

// Importers use quantity 1 for UID-style rows that omit an explicit amount.
assert.equal(normalizeInventoryItem({ id: 100, name: "Pillow", uid: "weapon-a" }, "Melee", 1).locationQuantity("inventory"), 1);
assert.equal(normalizeBazaarItem({ id: 100, uid: "weapon-a" }, 1).locationQuantity("bazaar"), 1);
assert.equal(normalizeDisplayCaseItem({ id: 100, uid: "armor-a" }, 1).locationQuantity("displayCase"), 1);
assert.equal(normalizeItemMarketListing({ item: { id: 100, uid: "listing-a" } }, 1).locationQuantity("itemMarket"), 1);

ItemStore.clear();
// Two unique inventory rows aggregate into one base-item OwnedItem.
ItemStore.merge([row(100, "inventory", 1, "Pillow"), row(100, "inventory", 1, "Pillow")], { replaceSources: ["inventory"] });
assert.equal(item(100).locationQuantity("inventory"), 2);
assert.equal(ItemStore.statistics().uniqueItems, 1);

// Explicit stack amounts and three unique armor rows remain additive only within this batch.
ItemStore.merge([row(100, "inventory", 1, "Pillow"), row(100, "inventory", 1, "Pillow"), row(101, "inventory", 10, "Stack"), row(102, "inventory", 1, "Armor"), row(102, "inventory", 1, "Armor"), row(102, "inventory", 1, "Armor")], { replaceSources: ["inventory"] });
assert.equal(item(101).locationQuantity("inventory"), 10);
assert.equal(item(102).locationQuantity("inventory"), 3);
assert.notEqual(item(101).id, item(102).id);

// Duplicate Bazaar, Item Market, and Display Case rows aggregate independently by source.
ItemStore.merge([row(100, "bazaar", 1, "Pillow"), row(100, "bazaar", 1, "Pillow")], { replaceSources: ["bazaar"] });
ItemStore.merge([row(100, "itemMarket", 1, "Pillow"), row(100, "itemMarket", 1, "Pillow")], { replaceSources: ["itemMarket"] });
ItemStore.merge([row(100, "displayCase", 1, "Pillow"), row(100, "displayCase", 1, "Pillow")], { replaceSources: ["displayCase"] });
assert.equal(item(100).totalQuantity, 8);

// Replacing an already synchronized source is idempotent, never additive to cache.
ItemStore.merge([row(100, "inventory", 1, "Pillow"), row(100, "inventory", 1, "Pillow")], { replaceSources: ["inventory"] });
assert.equal(item(100).locationQuantity("inventory"), 2);
assert.equal(item(100).totalQuantity, 8);

// A successful source replacement clears rows no longer returned, while an
// unavailable Bazaar is represented by no Bazaar replacement and stays cached.
ItemStore.merge([row(200, "inventory", 1), row(201, "inventory", 1)], { replaceSources: ["inventory"] });
ItemStore.merge([row(200, "inventory", 1)], { replaceSources: ["inventory"] });
assert.equal(item(201), undefined);
const cachedBazaar = item(100).locationQuantity("bazaar");
ItemStore.merge([row(100, "inventory", 2, "Pillow")], { replaceSources: ["inventory"] });
assert.equal(item(100).locationQuantity("bazaar"), cachedBazaar);

// Corrected total quantity naturally drives cash-basis matching and snapshots.
const pillow = item(100);
const basis = CostBasisService.calculate(pillow, [{
  id: "pillow-paid", timestamp: 1, sourceType: "bazaar",
  itemLines: [{ itemId: 100, quantity: pillow.totalQuantity, knownUnitCost: 10 }],
}]);
assert.equal(basis.currentQuantity, pillow.totalQuantity);
assert.equal(basis.matchedQuantity, pillow.totalQuantity);
SnapshotService.captureSnapshot();
assert.equal(HistoryStore.getLatestSnapshot().items.find((candidate) => Number(candidate.id) === 100).totalQuantity, pillow.totalQuantity);

console.log("ItemStore unique-equipment aggregation tests passed.");
