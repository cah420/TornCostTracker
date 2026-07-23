import assert from "node:assert/strict";
import { basisCompleteness, compareCurrentQuantity, createPurchasePositionDetails, deriveRemainingLot } from "./purchase-position-details.js";

const position = (overrides = {}) => ({ id: "inventory-position:1:1:fungible", itemId: "1", itemUid: null, itemName: "Item #1", originalQuantity: 20, consumedQuantity: 5, remainingQuantity: 15, knownQuantity: 15, deferredQuantity: 0, unknownQuantity: 0, knownBasis: 190, positionStatus: "PARTIAL", positionHealth: "HEALTHY", positionConfidence: 100, firstAcquisitionTimestamp: 1, lastAcquisitionTimestamp: 2, explanation: { status: { summary: "Deterministic." }, health: { summary: "Healthy." } }, ...overrides });
const lot = (id, overrides = {}) => ({ lotId: id, itemId: "1", itemUid: null, originalQuantity: 10, originalAllocatedBasis: 100, basisStatus: "known_allocated_basis", allocationStatus: "fully_allocated", acquisitionTimestamp: 1, consumedQuantity: 0, consumedKnownBasis: 0, ...overrides });

assert.deepEqual({ state: deriveRemainingLot(lot("open")).lotState, remaining: deriveRemainingLot(lot("open")).remainingQuantity }, { state: "OPEN", remaining: 10 });
assert.deepEqual({ state: deriveRemainingLot(lot("partial", { consumedQuantity: 4, consumedKnownBasis: 40 })).lotState, remaining: deriveRemainingLot(lot("partial", { consumedQuantity: 4 })).remainingQuantity }, { state: "PARTIAL", remaining: 6 });
assert.equal(deriveRemainingLot(lot("closed", { consumedQuantity: 10, consumedKnownBasis: 100 })).lotState, "CLOSED");
assert.equal(deriveRemainingLot(lot("free", { basisStatus: "known_no_cash_consideration", originalAllocatedBasis: null, consumedQuantity: 2 })).remainingKnownBasis, 0);
assert.equal(deriveRemainingLot(lot("deferred", { basisStatus: "known_group_basis_allocation_deferred", allocationStatus: "allocation_deferred", originalAllocatedBasis: null })).remainingKnownBasis, null);
assert.equal(deriveRemainingLot(lot("unknown", { basisStatus: "unknown_basis", originalAllocatedBasis: null })).basisCategory, "unknown");

assert.equal(basisCompleteness(position()), "COMPLETE");
assert.equal(basisCompleteness(position({ knownQuantity: 5, deferredQuantity: 5 })), "PARTIAL");
assert.equal(basisCompleteness(position({ knownQuantity: 0, deferredQuantity: 5 })), "DEFERRED");
assert.equal(basisCompleteness(position({ knownQuantity: 0, unknownQuantity: 5 })), "UNKNOWN");
assert.equal(basisCompleteness(position({ remainingQuantity: 0 })), "NONE");

const details = createPurchasePositionDetails({
  position: position(),
  lots: [lot("cheap", { originalQuantity: 10, originalAllocatedBasis: 100 }), lot("expensive", { originalQuantity: 10, originalAllocatedBasis: 200, consumedQuantity: 5, consumedKnownBasis: 110, acquisitionTimestamp: 2 })],
  consumptions: [{ consumptionId: "c1" }], itemPositions: [position()], currentItem: { totalQuantity: 15 }, catalogName: "Test Item",
});
assert.equal(details.itemName, "Test Item"); assert.equal(details.completeRemainingBasis, 190); assert.equal(details.lowestKnownUnitBasis, 10); assert.equal(details.highestKnownUnitBasis, 18); assert.equal(details.weightedAverageKnownUnitBasis, 190 / 15); assert.notEqual(details.weightedAverageKnownUnitBasis, 14); assert.equal(details.currentQuantityComparison.state, "MATCHED"); assert.deepEqual(details.trace.consumptionIds, ["c1"]);

const partial = createPurchasePositionDetails({ position: position({ knownQuantity: 10, deferredQuantity: 5, knownBasis: 100, positionHealth: "WARNING", explanation: { health: { summary: "History incomplete." }, status: { summary: "Known quantity." } } }), lots: [lot("a"), lot("d", { originalQuantity: 5, basisStatus: "known_group_basis_allocation_deferred", allocationStatus: "allocation_deferred", originalAllocatedBasis: null })] });
assert.equal(partial.completeRemainingBasis, null); assert.equal(partial.knownRemainingBasis, 100); assert.equal(partial.warnings.length, 2);
const free = createPurchasePositionDetails({ position: position({ originalQuantity: 1, consumedQuantity: 0, remainingQuantity: 1, knownQuantity: 1, knownBasis: 0 }), lots: [lot("z", { originalQuantity: 1, originalAllocatedBasis: null, basisStatus: "known_no_cash_consideration" })] });
assert.equal(free.lowestKnownUnitBasis, 0); assert.equal(free.highestKnownUnitBasis, 0); assert.equal(free.weightedAverageKnownUnitBasis, 0);
const large = createPurchasePositionDetails({ position: position({ originalQuantity: 1_000_000, consumedQuantity: 1, remainingQuantity: 999_999, knownQuantity: 999_999, knownBasis: 4_999_995_000 }), lots: [lot("large", { originalQuantity: 1_000_000, originalAllocatedBasis: 5_000_000_000, consumedQuantity: 1, consumedKnownBasis: 5_000 })] });
assert.equal(large.completeRemainingBasis, 4_999_995_000); assert.equal(large.weightedAverageKnownUnitBasis, 5_000);
const paged = createPurchasePositionDetails({ position: position({ remainingQuantity: 20, knownQuantity: 20, knownBasis: 1_100 }), lots: [lot("visible", { originalAllocatedBasis: 100 })], basisLots: [lot("visible", { originalAllocatedBasis: 100 }), lot("outside-page", { originalAllocatedBasis: 1_000 })] });
assert.equal(paged.lowestKnownUnitBasis, 10); assert.equal(paged.highestKnownUnitBasis, 100, "statistics include known lots outside the bounded display page");

assert.equal(compareCurrentQuantity(position(), null).state, "NOT_AVAILABLE");
assert.equal(compareCurrentQuantity(position(), { totalQuantity: 10 }, [position()]).state, "ACCOUNTING_HIGHER");
assert.equal(compareCurrentQuantity(position(), { totalQuantity: 20 }, [position()]).state, "TORN_HIGHER");
assert.equal(compareCurrentQuantity(position({ itemUid: "u1" }), { totalQuantity: 1 }, [position({ itemUid: "u1" })]).state, "NOT_COMPARABLE");
assert.equal(compareCurrentQuantity(position(), { totalQuantity: 15 }, [position(), position({ itemUid: "u1" })]).state, "NOT_COMPARABLE");

const uid = createPurchasePositionDetails({ position: position({ id: "uid", itemUid: "u1", originalQuantity: 1, consumedQuantity: 0, remainingQuantity: 1, knownQuantity: 1, knownBasis: 10 }), lots: [lot("u", { itemUid: "u1", originalQuantity: 1, originalAllocatedBasis: 10 })], itemPositions: [position({ itemUid: "u1" })], currentItem: { totalQuantity: 1 }, unassignedEvidence: [{ reasonCode: "uid_ambiguity", occurrenceCount: 1, unmatchedQuantity: 2 }] });
assert.equal(uid.identityType, "UID"); assert.equal(uid.unassignedEvidence[0].unmatchedQuantity, 2); assert.equal(uid.currentQuantityComparison.state, "NOT_COMPARABLE"); assert.ok(Object.isFrozen(uid));
const noCatalog = createPurchasePositionDetails({ position: position({ itemId: "99", itemName: "Item #99" }) }); assert.equal(noCatalog.itemName, "Item #99");
const noLots = createPurchasePositionDetails({ position: position({ knownQuantity: 0, deferredQuantity: 15, knownBasis: 0 }), lots: [] }); assert.equal(noLots.remainingLots.length, 0); assert.equal(noLots.basisCompleteness, "DEFERRED");
const mixedUnknown = createPurchasePositionDetails({ position: position({ knownQuantity: 5, unknownQuantity: 10, knownBasis: 50 }), lots: [lot("known", { originalQuantity: 5, originalAllocatedBasis: 50 }), lot("unknown", { basisStatus: "unknown_basis", originalAllocatedBasis: null })] }); assert.equal(mixedUnknown.basisCompleteness, "PARTIAL"); assert.equal(mixedUnknown.completeRemainingBasis, null);
const consumed = createPurchasePositionDetails({ position: position({ originalQuantity: 10, consumedQuantity: 10, remainingQuantity: 0, knownQuantity: 0, knownBasis: 0 }), lots: [lot("closed", { consumedQuantity: 10, consumedKnownBasis: 100 })] }); assert.equal(consumed.basisCompleteness, "NONE"); assert.equal(consumed.remainingLots[0].lotState, "CLOSED");
const reducedConfidence = createPurchasePositionDetails({ position: position({ positionHealth: "WARNING", positionConfidence: 75, historicalShortfallQuantity: 4, explanation: { status: { summary: "Known quantity." }, health: { summary: "Historical evidence limits confidence." } } }) }); assert.equal(reducedConfidence.positionConfidence, 75); assert.match(reducedConfidence.warnings[0], /Historical evidence/);
assert.equal(details.positionId, details.id); assert.equal(details.deferredRemainingQuantity, 0); assert.equal(details.weightedAverageKnownUnitCost, details.weightedAverageKnownUnitBasis); assert.ok(details.traceReferences.includes("c1"));
console.log("Purchase Position details, basis, UID, comparison, and large-value tests passed.");
