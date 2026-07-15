import assert from "node:assert/strict";
import { CostBasisService } from "./cost-basis-service.js";
import { Acquisition, OwnedItem } from "../../models.js";
import { normalizeAcquisitionLogs } from "../importers/purchase-log-importer.js";

function item(quantity, locations = {}){
  return { id: 1079, totalQuantity: quantity, locations };
}

function acquisition({ id, timestamp, sourceType = "bazaar", quantity, unitCost = null, allocationStatus = "resolved", itemId = 1079 }){
  return {
    id, timestamp, sourceType, allocationStatus,
    itemLines: [{ itemId, quantity, knownUnitCost: unitCost }],
  };
}

function calculate(quantity, records){
  return CostBasisService.calculate(item(quantity), records);
}

// Exact single lot and quantity aggregated across all owned locations.
let result = calculate(10, [acquisition({ id: "a", timestamp: 10, quantity: 10, unitCost: 100 })]);
assert.equal(result.totalKnownCost, 1000);
assert.equal(result.weightedAverageUnitCost, 100);
assert.equal(Array.isArray(result.matchedLots), true, "matched-lot provenance remains available to future consumers");
const distributedItem = new OwnedItem({
  id: 1079,
  locations: { inventory: 2, bazaar: 3, itemMarket: 4, displayCase: 1 },
});
assert.equal(CostBasisService.calculate(distributedItem, [acquisition({ id: "locations", timestamp: 11, quantity: 10, unitCost: 1 })]).matchedQuantity, 10);

// Multiple lots, newest first, with a partial older lot.
result = calculate(15, [
  acquisition({ id: "older", timestamp: 10, quantity: 20, unitCost: 80 }),
  acquisition({ id: "newer", timestamp: 20, quantity: 10, unitCost: 100 }),
]);
assert.deepEqual(result.matchedLots.map((lot) => lot.quantityUsed), [10, 5]);
assert.equal(result.totalKnownCost, 1400);
assert.equal(result.weightedAverageUnitCost, 1400 / 15);
assert.equal(result.lowestKnownUnitCost, 80);
assert.equal(result.highestKnownUnitCost, 100);

// Known history shortfall and no acquisition history.
result = calculate(10, [acquisition({ id: "a", timestamp: 10, quantity: 4, unitCost: 50 })]);
assert.equal(result.unmatchedQuantity, 6);
assert.equal(result.quantityCoveragePercent, 40);
assert.match(result.warnings.join(" "), /does not account for all currently owned units/);
assert.equal(calculate(3, []).matchedQuantity, 0);

// Unresolved multi-item trade and a resolved/unresolved mix never invent costs.
result = calculate(8, [
  acquisition({ id: "trade", timestamp: 20, sourceType: "trade", quantity: 5, allocationStatus: "unresolved" }),
  acquisition({ id: "shop", timestamp: 10, sourceType: "cityShop", quantity: 3, unitCost: 60 }),
]);
assert.equal(result.matchedQuantity, 8);
assert.equal(result.unresolvedQuantity, 5);
assert.equal(result.pricedQuantity, 3);
assert.equal(result.totalKnownCost, 180);

// PurchaseStore removes duplicate acquisition IDs; the calculator also refuses
// to double count duplicate IDs when invoked directly.
const duplicate = acquisition({ id: "duplicate", timestamp: 10, quantity: 2, unitCost: 20 });
assert.equal(calculate(3, [duplicate, { ...duplicate }]).matchedQuantity, 2);

// Multiple lines in a grouped acquisition, city shop, abroad source, and ties.
const grouped = {
  id: "grouped", timestamp: 30, sourceType: "abroadShop", sourceLocation: "Cayman Islands", allocationStatus: "resolved",
  itemLines: [{ itemId: 1, quantity: 9, knownUnitCost: 2 }, { itemId: 1079, quantity: 4, knownUnitCost: 70 }],
};
result = calculate(4, [grouped]);
assert.equal(result.totalKnownCost, 280);
assert.equal(result.matchedLots[0].source, "Abroad - Cayman Islands");
result = calculate(1, [
  acquisition({ id: "a", timestamp: 40, quantity: 1, unitCost: 10 }),
  acquisition({ id: "b", timestamp: 40, quantity: 1, unitCost: 20 }),
]);
assert.equal(result.matchedLots[0].acquisitionId, "b");

// Zero holdings do not consume history.
result = calculate(0, [acquisition({ id: "a", timestamp: 10, quantity: 2, unitCost: 10 })]);
assert.equal(result.matchedQuantity, 0);
assert.match(result.warnings.join(" "), /Current quantity is zero/);

// Confirmed free acquisitions are valid zero-cost lots and reduce the cash average.
const freeGift = new Acquisition({
  id: "gift", timestamp: 30, sourceType: "playerGift", acquisitionMethod: "playerGift",
  acquisitionKind: "free", costStatus: "zero",
  itemLines: [{ itemId: 1079, quantity: 5 }],
}).toJSON();
const paidLot = acquisition({ id: "paid", timestamp: 20, quantity: 5, unitCost: 100 });
result = calculate(10, [paidLot, freeGift]);
assert.equal(result.paidQuantity, 5);
assert.equal(result.zeroCostQuantity, 5);
assert.equal(result.pricedQuantity, 10);
assert.equal(result.totalKnownCost, 500);
assert.equal(result.weightedAverageUnitCost, 50);
assert.equal(result.lowestKnownUnitCost, 0);
assert.equal(result.matchedLots[0].acquisitionMethod, "playerGift");

// A clearly acquired non-cash lot remains distinct from free/zero cash cost.
const nonCash = new Acquisition({
  id: "conversion", timestamp: 40, sourceType: "itemConversion", acquisitionMethod: "itemConversion",
  acquisitionKind: "nonCash", costStatus: "nonCash",
  itemLines: [{ itemId: 1079, quantity: 4 }],
}).toJSON();
result = calculate(4, [nonCash]);
assert.equal(result.nonCashQuantity, 4);
assert.equal(result.pricedQuantity, 0);
assert.equal(result.totalKnownCost, null);
assert.match(result.warnings.join(" "), /non-cash acquisitions/);

// Legacy cached records receive paid/known defaults without losing provenance.
const migratedLegacy = Acquisition.from({
  id: "legacy", timestamp: 50, sourceType: "bazaar", itemLines: [{ itemId: 1079, quantity: 1, knownUnitCost: 10 }],
}).toJSON();
assert.equal(migratedLegacy.acquisitionKind, "paid");
assert.equal(migratedLegacy.costStatus, "known");
assert.equal(migratedLegacy.acquisitionMethod, "bazaar");

// Free records may retain multiple item lines, while internal movements never normalize.
const multiFree = new Acquisition({
  id: "multi-free", timestamp: 60, sourceType: "eventReward", acquisitionMethod: "eventReward",
  acquisitionKind: "free", costStatus: "zero",
  itemLines: [{ itemId: 1079, quantity: 2 }, { itemId: 1, quantity: 3 }],
}).toJSON();
assert.equal(multiFree.itemLines.every((line) => line.knownUnitCost === 0), true);
const lifecycleLogs = [
  { id: "bazaar-add", timestamp: 70, details: { title: "Bazaar add", id: 1200 }, data: { items: [{ item_id: 1079, quantity: 1 }] } },
  { id: "market-return", timestamp: 71, details: { title: "Item market remove", id: 1300 }, data: { items: [{ item_id: 1079, quantity: 1 }] } },
  { id: "trade-expire", timestamp: 72, details: { title: "Trade expire", id: 4420 }, data: { items: [{ item_id: 1079, quantity: 1 }] } },
];
assert.equal(normalizeAcquisitionLogs(lifecycleLogs).length, 0);

console.log("CostBasisService deterministic tests passed.");
