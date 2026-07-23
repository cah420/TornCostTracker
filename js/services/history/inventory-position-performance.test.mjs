import assert from "node:assert/strict";
import { addLotToInventoryPosition, createInventoryPositionAccumulator, finalizeInventoryPositions } from "./inventory-position.js";

const context = createInventoryPositionAccumulator(); const lots = 20_000;
for (let index = 0; index < lots; index++) {
  const itemId = String((index % 250) + 1); const quantity = 1_000; const consumedQuantity = index % 3;
  addLotToInventoryPosition(context, { id: `large-lot-${index}`, costLotVersion: 1, sourceLedgerVersion: 1, sourceProjectionVersion: 1, itemId, itemUid: null, originalQuantity: quantity, lotStatus: "open", basisStatus: "known_allocated_basis", allocationStatus: "fully_allocated", allocatedBasis: quantity * 5_000, unitBasis: 5_000, acquisitionTimestamp: index + 1, acquisitionSequence: String(index).padStart(12, "0") }, consumedQuantity ? { consumptionCount: 1, consumedQuantity, consumedBasis: consumedQuantity * 5_000 } : {});
}
const result = finalizeInventoryPositions(context);
assert.equal(result.positions.length, 250); assert.equal(result.diagnostics.length, 0);
assert.equal(result.positions.reduce((sum, row) => sum + row.originalQuantity, 0), lots * 1_000);
assert.equal(result.positions.reduce((sum, row) => sum + row.remainingBasis, 0), lots * 1_000 * 5_000 - result.positions.reduce((sum, row) => sum + row.consumedBasis, 0));
assert.equal(new Set(result.positions.map((row) => row.id)).size, result.positions.length);
console.log("Inventory Position large deterministic aggregation fixture passed.");
