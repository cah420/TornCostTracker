import assert from "node:assert/strict";
import { FifoDisposition, buildFifoSource } from "./fifo-consumption.js";
import { matchFifoItem } from "./fifo-matching-engine.js";

function line(id, itemId, quantity, { uid = null, direction = "out", sequence = 0 } = {}){ return { id, itemId, itemUid: uid, quantity, movementDirection: direction, lineSequence: sequence, lineKind: "monetary", debitAmount: null, creditAmount: null }; }
function disposal(id, timestamp, lines, total = 100){ return { id, ledgerVersion: 1, sourceProjectionVersion: 1, sourceProjectionId: `p:${id}`, sourceCanonicalEventId: `c:${id}`, eventTimestamp: timestamp, accountingClassification: "paid_disposal", projectionOutcome: "projectable", transactionStatus: "posted", balanceStatus: "balanced", debitTotal: total, creditTotal: total, policyCode: "paid-disposal", lines, sourceMetadata: {} }; }
function lot(id, itemId, quantity, timestamp, { uid = null, basis = quantity * 10, basisStatus = "known_allocated_basis", canonical = `c:${id}`, sequence = 0 } = {}){ return { id, lotGroupId: `g:${id}`, costLotVersion: 1, sourceLedgerVersion: 1, sourceLedgerTransactionId: `acq:${id}`, sourceProjectionId: `p:${id}`, sourceCanonicalEventId: canonical, itemId: String(itemId), itemUid: uid, originalQuantity: quantity, lotStatus: basisStatus === "known_allocated_basis" ? "open" : "deferred", basisStatus, allocationStatus: basisStatus === "known_allocated_basis" ? "fully_allocated" : "allocation_unknown", allocatedBasis: basisStatus === "known_allocated_basis" ? basis : null, unitBasis: basisStatus === "known_allocated_basis" && basis % quantity === 0 ? basis / quantity : null, acquisitionTimestamp: timestamp, acquisitionSequence: `${String(timestamp).padStart(12, "0")}:${canonical}:acq:${id}:${String(sequence).padStart(6, "0")}:${id}` }; }
function demandFor(transaction){ const result = buildFifoSource(transaction); assert.equal(result.disposition, null); return result.demands; }

const full = matchFifoItem(demandFor(disposal("d1", 20, [line("dl1", "1", 5)])), [lot("l1", "1", 5, 10)]);
assert.equal(full.consumptions.length, 1); assert.equal(full.consumptions[0].consumedQuantity, 5); assert.equal(full.demands[0].demandStatus, "matched"); assert.equal(full.lotStates[0].derivedState, "fully_consumed");

const partial = matchFifoItem(demandFor(disposal("d2", 20, [line("dl2", "1", 4)])), [lot("l2", "1", 10, 10)]);
assert.equal(partial.lotStates[0].derivedRemainingQuantity, 6); assert.equal(partial.lotStates[0].derivedState, "partially_consumed");

const spansLots = matchFifoItem(demandFor(disposal("d3", 30, [line("dl3", "1", 6)])), [lot("old", "1", 3, 10), lot("new", "1", 5, 20)]);
assert.deepEqual(spansLots.consumptions.map((row) => [row.sourceLotId, row.consumedQuantity]), [["old", 3], ["new", 3]]);
const multipleDisposals = matchFifoItem([...demandFor(disposal("d4a", 20, [line("dl4a", "1", 4)])), ...demandFor(disposal("d4b", 30, [line("dl4b", "1", 3)]))], [lot("shared", "1", 10, 10)]);
assert.deepEqual(multipleDisposals.consumptions.map((row) => row.consumedQuantity), [4, 3]); assert.equal(multipleDisposals.lotStates[0].derivedRemainingQuantity, 3);

const causal = matchFifoItem(demandFor(disposal("early", 10, [line("early-line", "1", 1)])), [lot("future", "1", 1, 11)]);
assert.equal(causal.consumptions.length, 0); assert.equal(causal.demands[0].reasonCode, "disposal_precedes_available_lots");
const tied = matchFifoItem(demandFor(disposal("tie", 10, [line("tie-line", "1", 1)])), [lot("tie-b", "1", 1, 10, { canonical: "c:z" }), lot("tie-a", "1", 1, 10, { canonical: "c:a" })]);
assert.equal(tied.consumptions[0].sourceLotId, "tie-a");

const uidExact = matchFifoItem(demandFor(disposal("uid", 20, [line("uid-line", "2", 1, { uid: "u2" })])), [lot("u1", "2", 1, 10, { uid: "u1" }), lot("u2", "2", 1, 11, { uid: "u2" })]);
assert.equal(uidExact.consumptions[0].sourceLotId, "u2"); assert.equal(uidExact.consumptions[0].matchType, "uid_exact");
const uidMissing = matchFifoItem(demandFor(disposal("uid-missing", 20, [line("uid-missing-line", "2", 1)])), [lot("unique", "2", 1, 10, { uid: "u1" })]);
assert.equal(uidMissing.consumptions.length, 0); assert.equal(uidMissing.demands[0].demandStatus, "unresolved"); assert.equal(uidMissing.demands[0].reasonCode, "outgoing_uid_missing");
const duplicateUid = matchFifoItem(demandFor(disposal("uid-duplicate", 20, [line("uid-duplicate-line", "2", 1, { uid: "same" })])), [lot("duplicate-1", "2", 1, 10, { uid: "same" }), lot("duplicate-2", "2", 1, 11, { uid: "same" })]);
assert.equal(duplicateUid.demands[0].demandStatus, "fifo_error"); assert.equal(duplicateUid.demands[0].reasonCode, "ambiguous_specific_item_identity");

const unknown = matchFifoItem(demandFor(disposal("unknown", 20, [line("unknown-line", "3", 1)])), [lot("unknown-lot", "3", 1, 10, { basisStatus: "unknown_basis", basis: null })]);
assert.equal(unknown.consumptions[0].consumedAllocatedBasis, null); assert.equal(unknown.consumptions[0].matchType, "deferred_basis_fifo");
const indivisible = matchFifoItem([...demandFor(disposal("i1", 20, [line("i1-line", "4", 1)])), ...demandFor(disposal("i2", 30, [line("i2-line", "4", 2)]))], [lot("indivisible", "4", 3, 10, { basis: 1000000 })]);
assert.deepEqual(indivisible.consumptions.map((row) => row.consumedAllocatedBasis), [333333, 666667]); assert.equal(indivisible.consumptions.reduce((sum, row) => sum + row.consumedAllocatedBasis, 0), 1000000); assert.equal(indivisible.basisErrors, 0);

const shortfall = matchFifoItem(demandFor(disposal("short", 20, [line("short-line", "5", 6)])), [lot("short-lot", "5", 2, 10)]);
assert.equal(shortfall.demands[0].matchedQuantity, 2); assert.equal(shortfall.demands[0].unmatchedQuantity, 4); assert.equal(shortfall.demands[0].demandStatus, "partially_matched");
const invalidSupply = matchFifoItem(demandFor(disposal("invalid-supply", 20, [line("invalid-supply-line", "5", 1)])), [{ ...lot("invalid-lot", "5", 1, 10), originalQuantity: 0 }]); assert.equal(invalidSupply.supplyErrors, 1); assert.equal(invalidSupply.consumptions.length, 0);
assert.equal(buildFifoSource({ ...disposal("acq", 1, []), accountingClassification: "paid_acquisition" }).disposition.disposition, FifoDisposition.noDemand);
assert.equal(buildFifoSource({ ...disposal("transfer", 1, []), accountingClassification: "transfer_neutral", transactionStatus: "memorandum" }).disposition.disposition, FifoDisposition.ineligible);
assert.equal(buildFifoSource({ ...disposal("trade", 1, []), accountingClassification: "trade_unresolved", transactionStatus: "unresolved" }).disposition.disposition, FifoDisposition.unresolved);
assert.equal(buildFifoSource(disposal("bad", 1, [line("bad-line", "1", 0)])).disposition.disposition, FifoDisposition.error);
console.log("FIFO demand, matching, UID, causal-order, and basis tests passed.");
