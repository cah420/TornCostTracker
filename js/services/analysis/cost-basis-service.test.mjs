import assert from "node:assert/strict";
import { CostBasisService } from "./cost-basis-service.js";
import { OwnedItem } from "../../models.js";

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

console.log("CostBasisService deterministic tests passed.");
