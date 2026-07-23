import assert from "node:assert/strict";
import { COST_LOT_VERSION, CostLotDisposition, buildCostLotDisposition } from "./cost-lot.js";

function itemLine(sequence, { itemId = "12", itemUid = null, quantity = 1, direction = "in", lineKind = "monetary" } = {}){ return { id: `ledger-line:${sequence}`, lineSequence: sequence, accountCode: "inventory_asset_pending_basis", debitAmount: null, creditAmount: null, itemId, itemUid, quantity, movementDirection: direction, lineKind }; }
function ledger({ id = "ledger:one", classification = "paid_acquisition", status = "posted", debitTotal = 1000, creditTotal = debitTotal, lines = [itemLine(0)], basisStatus = null } = {}){ return { id, ledgerVersion: 1, sourceProjectionVersion: 1, sourceProjectionId: `projection:${id}`, sourceCanonicalEventId: `canonical:${id}`, eventTimestamp: 100, accountingClassification: classification, projectionOutcome: "projectable", transactionStatus: status, balanceStatus: status === "posted" ? "balanced" : "not_monetary", debitTotal, creditTotal, policyCode: classification.replaceAll("_", "-"), lines, basisStatus, sourceMetadata: {} }; }

const single = buildCostLotDisposition(ledger({ debitTotal: 1250, lines: [itemLine(0, { quantity: 5 })] }));
assert.equal(single.disposition.disposition, CostLotDisposition.lotsCreated);
assert.equal(single.group.originalTotalBasis, 1250); assert.equal(single.group.allocatedTotalBasis, 1250); assert.equal(single.group.unallocatedTotalBasis, 0);
assert.equal(single.lots[0].unitBasis, 250); assert.equal(single.lots[0].remainingQuantity, 5); assert.equal(single.lots[0].consumedQuantity, 0); assert.equal(single.lots[0].itemUid, null);
assert.equal(single.lots[0].costLotVersion, COST_LOT_VERSION);
assert.deepEqual(buildCostLotDisposition(ledger({ debitTotal: 1250, lines: [itemLine(0, { quantity: 5 })] })), single, "identities and acquisition order are stable");
const uidSpecific = buildCostLotDisposition(ledger({ id: "ledger:uid", debitTotal: 500, lines: [itemLine(0, { quantity: 1, itemUid: "uid-1" })] })); assert.equal(uidSpecific.lots[0].itemUid, "uid-1");

const indivisible = buildCostLotDisposition(ledger({ id: "ledger:indivisible", debitTotal: 1000, lines: [itemLine(0, { quantity: 3 })] }));
assert.equal(indivisible.lots[0].allocatedBasis, 1000); assert.equal(indivisible.lots[0].unitBasis, null); assert.equal(indivisible.group.diagnosticReason, "indivisible_unit_basis");

const multi = buildCostLotDisposition(ledger({ id: "ledger:multi", debitTotal: 900, lines: [itemLine(0, { itemId: "1", lineKind: "memorandum" }), itemLine(1, { itemId: "2", quantity: 2, lineKind: "memorandum" })] }));
assert.equal(multi.disposition.disposition, CostLotDisposition.deferredLotsCreated); assert.equal(multi.group.lotCount, 2); assert.equal(multi.group.originalTotalQuantity, 3); assert.equal(multi.group.originalTotalBasis, 900); assert.equal(multi.group.allocatedTotalBasis, 0); assert.equal(multi.group.unallocatedTotalBasis, 900); assert.ok(multi.lots.every((lot) => lot.allocatedBasis === null));

const repeated = buildCostLotDisposition(ledger({ id: "ledger:repeat", lines: [itemLine(0, { itemId: "9" }), itemLine(1, { itemId: "9" })] }));
assert.equal(repeated.lots.length, 2); assert.notEqual(repeated.lots[0].id, repeated.lots[1].id); assert.ok(repeated.lots[0].acquisitionSequence < repeated.lots[1].acquisitionSequence);

const reward = buildCostLotDisposition(ledger({ id: "ledger:reward", classification: "reward_non_cash", status: "deferred", debitTotal: 0, basisStatus: "known_no_cash_consideration", lines: [itemLine(0, { quantity: 4, lineKind: "memorandum" })] }));
assert.equal(reward.disposition.disposition, CostLotDisposition.deferredLotsCreated); assert.equal(reward.group.originalTotalBasis, 0); assert.equal(reward.group.basisStatus, "known_no_cash_consideration"); assert.equal(reward.lots[0].allocatedBasis, 0); assert.equal(reward.lots[0].unitBasis, 0); assert.equal(reward.lots[0].lotStatus, "deferred");
const unknownReward = buildCostLotDisposition(ledger({ id: "ledger:unknown-reward", classification: "reward_non_cash", status: "deferred", debitTotal: 0, basisStatus: "unknown_basis", lines: [itemLine(0, { quantity: 2, lineKind: "memorandum" })] }));
assert.equal(unknownReward.group.originalTotalBasis, null); assert.equal(unknownReward.lots[0].basisStatus, "unknown_basis");
const nonCashAcquisition = buildCostLotDisposition(ledger({ id: "ledger:non-cash", classification: "non_cash_acquisition", status: "deferred", debitTotal: 0, basisStatus: "unknown_basis", lines: [itemLine(0, { itemId: "22", quantity: 3, lineKind: "memorandum" })] }));
assert.equal(nonCashAcquisition.disposition.disposition, CostLotDisposition.deferredLotsCreated); assert.equal(nonCashAcquisition.group.groupType, "deferred_acquisition"); assert.equal(nonCashAcquisition.lots[0].originalQuantity, 3); assert.equal(nonCashAcquisition.lots[0].basisStatus, "unknown_basis");

const conversion = buildCostLotDisposition(ledger({ id: "ledger:conversion", classification: "conversion", status: "deferred", debitTotal: 0, lines: [itemLine(0, { itemId: "2", direction: "out", lineKind: "memorandum" }), itemLine(1, { itemId: "3", quantity: 2, direction: "in", lineKind: "memorandum" })] }));
assert.equal(conversion.lots.length, 1); assert.equal(conversion.lots[0].itemId, "3"); assert.equal(conversion.lots[0].lotStatus, "deferred");
const cashOnlyConversion = buildCostLotDisposition(ledger({ id: "ledger:cash-conversion", classification: "conversion", lines: [{ ...itemLine(0, { direction: "out" }) }, { id: "cash", lineKind: "monetary", movementDirection: "in", debitAmount: 50, creditAmount: null, itemId: null, quantity: null }] }));
assert.equal(cashOnlyConversion.disposition.disposition, CostLotDisposition.noItemEntry); assert.equal(cashOnlyConversion.group, null);

const duplicateUid = buildCostLotDisposition(ledger({ id: "ledger:duplicate-uid", lines: [itemLine(0, { itemUid: "same" }), itemLine(1, { itemId: "13", itemUid: "same" })] }));
assert.equal(duplicateUid.disposition.disposition, CostLotDisposition.error); assert.equal(duplicateUid.disposition.reasonCode, "duplicate_item_uid"); assert.equal(duplicateUid.group, null);
const invalidQuantity = buildCostLotDisposition(ledger({ id: "ledger:bad-quantity", lines: [itemLine(0, { quantity: 0 })] }));
assert.equal(invalidQuantity.disposition.disposition, CostLotDisposition.error); assert.equal(invalidQuantity.group, null);

const disposal = buildCostLotDisposition(ledger({ id: "ledger:disposal", classification: "paid_disposal", lines: [itemLine(0, { direction: "out" })] }));
assert.equal(disposal.disposition.disposition, CostLotDisposition.noItemEntry);
assert.equal(disposal.disposition.costLotVersion, COST_LOT_VERSION, "disposition-only records use the current Cost Lot version");
assert.match(disposal.disposition.id, new RegExp(`^lot-disposition:${COST_LOT_VERSION}:`));
assert.equal(buildCostLotDisposition(ledger({ id: "ledger:wallet", classification: "wallet_movement", lines: [] })).disposition.disposition, CostLotDisposition.noItemEntry);
assert.equal(buildCostLotDisposition(ledger({ id: "ledger:transfer", classification: "transfer_neutral", status: "memorandum" })).disposition.disposition, CostLotDisposition.ineligible);
assert.equal(buildCostLotDisposition(ledger({ id: "ledger:trade", classification: "trade_unresolved", status: "unresolved", lines: [] })).disposition.disposition, CostLotDisposition.unresolved);
assert.equal(buildCostLotDisposition(ledger({ id: "ledger:error", classification: "projection_error", status: "ledger_error", lines: [] })).disposition.disposition, CostLotDisposition.error);
assert.equal(buildCostLotDisposition(null).disposition.reasonCode, "missing_source_transaction");
console.log("Cost Lot model and policy deterministic tests passed.");
