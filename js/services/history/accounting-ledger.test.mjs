import assert from "node:assert/strict";
import { ACCOUNT_CATALOG, LedgerStatus, buildLedgerTransaction } from "./accounting-ledger.js";

function projection({ id = "projection:1:test", classification = "paid_acquisition", outcome = "projectable", movements = [{ category: "item_in", canonicalMovement: { resourceId: "12", quantity: 2, direction: "in", attributes: { uid: "uid-1" } } }, { category: "cash_out", canonicalMovement: { amount: 1000, direction: "out" } }] } = {}){
  return { id, projectionVersion: 1, canonicalEventId: `canonical:${id}`, canonicalEventType: "acquisition", eventTimestamp: 100, classification, outcome, projectedMovements: movements, sourceMetadata: {}, basisStatus: "known_total_consideration", proceedsStatus: "not_applicable" };
}

assert.ok(ACCOUNT_CATALOG.some((account) => account.code === "inventory_asset_pending_basis"));
assert.ok(ACCOUNT_CATALOG.every((account) => account.code && account.category && typeof account.monetary === "boolean"));

const acquisition = buildLedgerTransaction(projection());
assert.equal(acquisition.transactionStatus, LedgerStatus.posted);
assert.equal(acquisition.debitTotal, 1000);
assert.equal(acquisition.creditTotal, 1000);
assert.equal(acquisition.balanceStatus, "balanced");
assert.equal(acquisition.lines[0].itemUid, "uid-1");
assert.deepEqual(buildLedgerTransaction(projection()), acquisition, "ledger identities and lines are stable");

const multiItem = buildLedgerTransaction(projection({ id: "projection:1:multi", movements: [{ category: "item_in", canonicalMovement: { resourceId: "1", quantity: 1, direction: "in", attributes: {} } }, { category: "item_in", canonicalMovement: { resourceId: "2", quantity: 1, direction: "in", attributes: {} } }, { category: "cash_out", canonicalMovement: { amount: 1000, direction: "out" } }] }));
assert.equal(multiItem.allocationStatus, "deferred");
assert.equal(multiItem.debitTotal, multiItem.creditTotal);

const reward = buildLedgerTransaction(projection({ id: "projection:1:reward", classification: "reward_non_cash", movements: [{ category: "item_in", canonicalMovement: { resourceId: "5", quantity: 1, direction: "in", attributes: {} } }] }));
assert.equal(reward.transactionStatus, LedgerStatus.deferred);
assert.equal(reward.debitTotal, 0);
assert.equal(reward.lines[0].debitAmount, null);
const nonCashAcquisition = buildLedgerTransaction(projection({ id: "projection:1:non-cash", classification: "non_cash_acquisition", movements: [{ category: "item_in", canonicalMovement: { resourceId: "6", quantity: 3, direction: "in", attributes: {} } }] }));
assert.equal(nonCashAcquisition.transactionStatus, LedgerStatus.deferred);
assert.equal(nonCashAcquisition.policyCode, "non-cash-acquisition");
assert.equal(nonCashAcquisition.lines[0].itemId, "6");
assert.equal(nonCashAcquisition.lines[0].quantity, 3);

const transfer = buildLedgerTransaction(projection({ id: "projection:1:transfer", classification: "transfer_neutral", outcome: "neutral", movements: [{ category: "neutral_item_in", canonicalMovement: { resourceId: "5", quantity: 1, direction: "in", attributes: {} } }] }));
assert.equal(transfer.transactionStatus, LedgerStatus.memorandum);

const trade = buildLedgerTransaction({ ...projection({ id: "projection:1:trade" }), classification: "trade_unresolved", outcome: "unresolved", projectedMovements: [], unresolvedReason: { code: "trade_correlation_required" } });
assert.equal(trade.transactionStatus, LedgerStatus.unresolved);
assert.equal(trade.unresolvedReason.code, "trade_correlation_required");

const malformed = buildLedgerTransaction(projection({ id: "projection:1:bad", movements: [{ category: "item_in", canonicalMovement: { resourceId: "5", quantity: 1, direction: "in", attributes: {} } }, { category: "cash_out", canonicalMovement: { amount: 1.5, direction: "out" } }] }));
assert.equal(malformed.transactionStatus, LedgerStatus.error);

console.log("accounting-ledger model tests passed");
