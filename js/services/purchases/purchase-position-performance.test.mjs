import assert from "node:assert/strict";
import { createPurchasePositionDetails } from "./purchase-position-details.js";

const count = 10_000;
const lots = Array.from({ length: count }, (_, index) => ({
  lotId: `lot-${String(index).padStart(5, "0")}`,
  itemId: "1",
  itemUid: null,
  originalQuantity: 10,
  originalAllocatedBasis: (index + 1) * 10,
  basisStatus: "known_allocated_basis",
  allocationStatus: "fully_allocated",
  consumedQuantity: index % 3,
  consumedKnownBasis: Math.floor(((index + 1) * 10 * (index % 3)) / 10),
}));
const knownQuantity = lots.reduce((sum, lot) => sum + lot.originalQuantity - lot.consumedQuantity, 0);
const knownBasis = lots.reduce((sum, lot) => sum + lot.originalAllocatedBasis - lot.consumedKnownBasis, 0);
const position = { id: "large", itemId: "1", itemUid: null, originalQuantity: count * 10, consumedQuantity: count * 10 - knownQuantity, remainingQuantity: knownQuantity, knownQuantity, deferredQuantity: 0, unknownQuantity: 0, knownBasis, positionStatus: "PARTIAL", positionHealth: "HEALTHY", positionConfidence: 100 };
const started = performance.now();
const first = createPurchasePositionDetails({ position, lots });
const duration = performance.now() - started;
const second = createPurchasePositionDetails({ position, lots });
assert.equal(first.remainingLots.length, count); assert.equal(first.knownRemainingBasis, knownBasis); assert.equal(first.weightedAverageKnownUnitBasis, knownBasis / knownQuantity); assert.equal(first.lowestKnownUnitBasis, second.lowestKnownUnitBasis); assert.equal(first.highestKnownUnitBasis, second.highestKnownUnitBasis); assert.ok(duration < 2_000, `10,000-lot read-model assembly took ${duration}ms`);
console.log(`Purchase Position 10,000-lot deterministic fixture passed in ${Math.round(duration)}ms.`);
