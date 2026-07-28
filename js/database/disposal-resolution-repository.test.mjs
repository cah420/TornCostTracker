import assert from "node:assert/strict";
import { DisposalResolutionRepository } from "./disposal-resolution-repository.js";

class DatabaseMock {
  constructor({ fail = false } = {}){ this.transactions = []; this.fail = fail; }
  async query(){ return []; }
  async transaction(statements){ this.transactions.push(statements); if (this.fail) throw new Error("transaction failed"); }
}
const resolution = { id: "disposal-resolution:88:2", sourceTransactionId: "88", resolutionVersion: 2, schemaVersion: 1, resolverVersion: "1.0.0", accountingPolicyVersion: 1, status: "active", resolutionMethod: "manual_multi_item", totalGrossProceeds: 100, totalFees: 0, totalNetProceeds: 100, allocations: [], evidenceHash: "hash", completionSourceLogId: "complete", counterpartyId: "7", transactionTimestamp: 20, supersedesResolutionId: "disposal-resolution:88:1", isActive: true, createdAt: 30, updatedAt: 30, resolvedAt: 30 };
const previous = { ...resolution, id: "disposal-resolution:88:1", resolutionVersion: 1, supersedesResolutionId: null };
const event = { id: "canonical:disposal:new", sourceLogId: "complete", eventTimestamp: 20, parserName: "disposal-resolution-projector", parserVersion: "1.0.0", schemaVersion: 1, eventType: "disposal", attributes: {} };
const database = new DatabaseMock(); const repository = new DisposalResolutionRepository(database);
await repository.saveRevision(resolution, [event], { previous, derivedVersions: { projection: 2, ledger: 2, costLot: 2, fifo: 2, position: 1 } });
const sql = database.transactions[0].map((row) => row.sql).join("\n");
assert.match(sql, /status = 'superseded'/); assert.match(sql, /disposal_resolution_event_links/); assert.match(sql, /INSERT INTO disposal_resolutions/);
assert.match(sql, /DELETE FROM accounting_realized_results/); assert.match(sql, /DELETE FROM accounting_fifo_consumptions/); assert.match(sql, /accounting_rebuild_state/);
assert.equal(database.transactions.length, 1);
await assert.rejects(() => new DisposalResolutionRepository(new DatabaseMock({ fail: true })).saveRevision(resolution, [event], { previous, derivedVersions: { projection: 2, ledger: 2, costLot: 2, fifo: 2, position: 1 } }), /transaction failed/);
console.log("Disposal Resolution transactional repository tests passed.");
