import assert from "node:assert/strict";
import { projectTradeResolution } from "./trade-resolution-projector.js";
import { projectCanonicalEvent } from "./accounting-projection.js";
import { buildLedgerTransaction } from "./accounting-ledger.js";
import { buildCostLotDisposition } from "./cost-lot.js";

const resolution = {
  id: "trade-resolution:77:2", tradeId: "77", resolutionVersion: 2, resolutionMethod: "manual_multi_item",
  resolverVersion: "1.0.0", accountingPolicyVersion: 1, status: "active", isActive: true,
  completionSourceLogId: "complete", tradeTimestamp: 100, counterpartyId: "9",
  allocations: [{ itemId: "1", quantity: 2, lots: [{ uid: null, quantity: 2, allocatedBasis: 75 }] }, { itemId: "2", quantity: 1, lots: [{ uid: "u2", quantity: 1, allocatedBasis: 25 }] }],
};
const events = projectTradeResolution(resolution);
assert.equal(events.length, 2);
assert.equal(events.every((event) => event.eventType === "acquisition"), true);
assert.equal(events.every((event) => event.sourceLogId === "complete"), true);
assert.equal(events.every((event) => event.attributes.tradeResolutionId === resolution.id), true);
assert.equal(events[1].movements.find((row) => row.resourceType === "item").attributes.uid, "u2");
const lots = events.map((event) => buildCostLotDisposition(buildLedgerTransaction(projectCanonicalEvent(event)))).flatMap((output) => output.lots);
assert.deepEqual(lots.map((lot) => [lot.itemId, lot.itemUid, lot.originalQuantity, lot.allocatedBasis]), [["1", null, 2, 75], ["2", "u2", 1, 25]]);
assert.deepEqual(projectTradeResolution({ ...resolution, status: "superseded", isActive: false }), []);
assert.deepEqual(projectTradeResolution({ ...resolution, status: "needs_review" }), []);
console.log("Trade Resolution canonical projector tests passed.");
