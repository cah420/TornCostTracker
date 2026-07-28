import assert from "node:assert/strict";
import { projectDisposalResolution } from "./disposal-resolution-projector.js";
import { projectCanonicalEvent } from "./accounting-projection.js";
import { buildLedgerTransaction } from "./accounting-ledger.js";
import { buildFifoSource } from "./fifo-consumption.js";

const resolution = {
  id: "disposal-resolution:88:1", sourceTransactionId: "88", resolutionVersion: 1, resolutionMethod: "manual_multi_item",
  status: "active", isActive: true, completionSourceLogId: "complete", transactionTimestamp: 200, counterpartyId: "7",
  allocations: [{ itemId: "1", quantity: 2, lots: [{ uid: null, quantity: 2, allocatedProceeds: 75 }] }, { itemId: "2", quantity: 1, lots: [{ uid: "u2", quantity: 1, allocatedProceeds: 25 }] }],
};
const events = projectDisposalResolution(resolution);
assert.equal(events.length, 2);
assert.equal(events.every((event) => event.eventType === "disposal"), true);
assert.equal(events.every((event) => event.attributes.disposalResolutionId === resolution.id), true);
assert.equal(events[1].movements.find((row) => row.resourceType === "item").attributes.uid, "u2");
const demands = events.flatMap((event) => buildFifoSource(buildLedgerTransaction(projectCanonicalEvent(event))).demands);
assert.deepEqual(demands.map((row) => [row.itemId, row.itemUid, row.originalDemandQuantity, row.proceedsTotal]), [["1", null, 2, 75], ["2", "u2", 1, 25]]);
assert.deepEqual(projectDisposalResolution({ ...resolution, status: "superseded", isActive: false }), []);
assert.deepEqual(projectDisposalResolution({ ...resolution, status: "needs_review" }), []);
console.log("Disposal Resolution canonical projection and FIFO demand tests passed.");
