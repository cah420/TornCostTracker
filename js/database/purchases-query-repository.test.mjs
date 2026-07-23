import assert from "node:assert/strict";
import { PurchasesQueryRepository } from "./purchases-query-repository.js";

class MockDatabase {
  constructor(){ this.calls = []; }
  async query(sql, bind){
    this.calls.push({ sql, bind });
    if (sql.includes("COUNT(*) AS count")) return [{ count: 2 }];
    if (sql.includes("accounting_fifo_disposal_demands")) return [{ reasonCode: "historical_shortfall", demandStatus: "unmatched", occurrenceCount: 2, unmatchedQuantity: 7 }];
    if (sql.includes("FROM accounting_fifo_consumptions c JOIN")) return [{ consumptionId: "c1", consumedQuantity: 2, consumedKnownBasis: 20, disposalTimestamp: 10 }];
    return [{ lotId: "l1", itemId: "1", itemUid: null, originalQuantity: 10, originalAllocatedBasis: 100, originalUnitBasis: 10, acquisitionTimestamp: 1, consumptionCount: 1, consumedQuantity: 2, consumedKnownBasis: 20, nullBasisConsumptionCount: 0, firstConsumptionTimestamp: 2, lastConsumptionTimestamp: 2, lotPayloadJson: JSON.stringify({ sourceAccountingClassification: "paid", sourceLedgerPolicyCode: "paid_purchase" }) }];
  }
}
const database = new MockDatabase(); const repository = new PurchasesQueryRepository(database);
const lots = await repository.listLotsByPositionIdentity({ costLotVersion: 1, fifoVersion: 1, itemId: "1", state: "remaining" });
assert.equal(lots[0].sourceClassification, "paid"); assert.equal(lots[0].originalQuantity, 10); assert.equal("lotPayloadJson" in lots[0], false);
assert.match(database.calls[0].sql, /cost_lot_version = \? AND l\.item_id = \? AND l\.item_uid IS NULL/); assert.match(database.calls[0].sql, /HAVING .* > 0/); assert.doesNotMatch(database.calls[0].sql, /INSERT|UPDATE|DELETE/);
assert.equal(await repository.countLotsByPositionIdentity({ costLotVersion: 1, fifoVersion: 1, itemId: "1" }), 2);
const ratios = await repository.listRemainingKnownBasisRatios({ costLotVersion: 1, fifoVersion: 1, itemId: "1" }); assert.equal(ratios[0].originalAllocatedBasis, 100); assert.match(database.calls.at(-1).sql, /known_no_cash_consideration/); assert.match(database.calls.at(-1).sql, /LIMIT \? OFFSET \?/);
const consumptions = await repository.listConsumptionsByPositionIdentity({ costLotVersion: 1, fifoVersion: 1, itemId: "1", itemUid: "u1" }); assert.equal(consumptions[0].consumedQuantity, 2); assert.ok(database.calls.at(-1).bind.includes("u1"));
assert.equal(await repository.countConsumptionsByPositionIdentity({ costLotVersion: 1, fifoVersion: 1, itemId: "1" }), 2);
const evidence = await repository.itemLevelUnassignedEvidence(1, "1"); assert.equal(evidence[0].unmatchedQuantity, 7);
assert.equal(database.calls.every(({ sql }) => !/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)), true);
console.log("Read-only indexed Purchases repository tests passed.");
