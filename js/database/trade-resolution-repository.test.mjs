import assert from "node:assert/strict";
import { TradeResolutionRepository } from "./trade-resolution-repository.js";

class DatabaseMock {
  constructor({ fail = false } = {}){ this.transactions = []; this.fail = fail; }
  async query(){ return []; }
  async transaction(statements){ this.transactions.push(statements); if (this.fail) throw new Error("transaction failed"); }
}
const resolution = { id: "trade-resolution:77:2", tradeId: "77", resolutionVersion: 2, schemaVersion: 1, resolverVersion: "1.0.0", accountingPolicyVersion: 1, status: "active", resolutionMethod: "manual_multi_item", totalCashSent: 100, allocations: [], evidenceHash: "hash", completionSourceLogId: "complete", counterpartyId: "5", tradeTimestamp: 10, supersedesResolutionId: "trade-resolution:77:1", isActive: true, createdAt: 20, updatedAt: 20, resolvedAt: 20 };
const previous = { ...resolution, id: "trade-resolution:77:1", resolutionVersion: 1, completionSourceLogId: "complete", supersedesResolutionId: null };
const event = { id: "canonical:new", sourceLogId: "complete", eventTimestamp: 10, parserName: "trade-resolution-projector", parserVersion: "1.0.0", schemaVersion: 1, eventType: "acquisition" };
const database = new DatabaseMock(); const repository = new TradeResolutionRepository(database);
await repository.saveRevision(resolution, [event], { previous, derivedVersions: { projection: 2, ledger: 2, costLot: 2, fifo: 2, position: 1 } });
const sql = database.transactions[0].map((entry) => entry.sql).join("\n");
assert.match(sql, /status = 'superseded'/);
assert.match(sql, /DELETE FROM accounting_projections/);
assert.match(sql, /DELETE FROM canonical_events/);
assert.match(sql, /INSERT INTO trade_resolutions/);
assert.match(sql, /INSERT INTO canonical_events/);
assert.match(sql, /trade_resolution_event_links/);
assert.match(sql, /accounting_rebuild_state/);
assert.match(sql, /DELETE FROM accounting_inventory_positions/);
assert.match(sql, /DELETE FROM accounting_fifo_consumptions/);
assert.match(sql, /DELETE FROM accounting_cost_lots/);
assert.match(sql, /DELETE FROM accounting_ledger_transactions/);
assert.equal(database.transactions.length, 1, "revision replacement is one transaction");
await assert.rejects(() => new TradeResolutionRepository(new DatabaseMock({ fail: true })).saveRevision(resolution, [event], { previous, derivedVersions: { projection: 2, ledger: 2, costLot: 2, fifo: 2, position: 1 } }), /transaction failed/);
console.log("Trade Resolution transactional repository tests passed.");
