import assert from "node:assert/strict";
import { InventoryPositionRepository } from "./inventory-position-repository.js";

class DatabaseMock {
  constructor(){ this.queries = []; this.transactions = []; }
  async query(sql, bind = []){ this.queries.push({ sql, bind }); if (sql.includes("SELECT id FROM accounting_inventory_positions")) return []; if (sql.includes("accounting_inventory_position_runs")) return [{ id: 1, status: "running", metrics_json: "{}" }]; if (sql.includes("COUNT(*)")) return [{ positions: 0, diagnostics: 0 }]; return []; }
  async transaction(statements){ this.transactions.push(statements); }
}
const database = new DatabaseMock(); const repository = new InventoryPositionRepository(database);
await repository.startRun({ positionVersion: 1, sourceCostLotVersion: 1, sourceFifoVersion: 1, sourceLedgerVersion: 1, startedAt: 10 });
assert.equal(database.transactions.at(-1).length, 2); assert.match(database.transactions.at(-1)[0].sql, /status = 'failed'/);
const position = { id: "inventory-position:1:1:fungible", positionVersion: 1, itemId: "1", itemName: "Item #1", itemUid: null, sourceCostLotVersion: 1, sourceFifoVersion: 1, sourceLedgerVersion: 1, sourceProjectionVersion: 1, firstAcquisitionTimestamp: 1, lastAcquisitionTimestamp: 2, originalQuantity: 10, consumedQuantity: 4, remainingQuantity: 6, originalBasis: 100, consumedBasis: 40, remainingBasis: 60, knownQuantity: 6, deferredQuantity: 0, unknownQuantity: 0, knownBasis: 60, deferredBasis: 0, fifoReadyQuantity: 6, uidQuantity: 0, fungibleQuantity: 6, openLotCount: 0, partiallyConsumedLotCount: 1, fullyConsumedLotCount: 0, lotCount: 1, positionStatus: "PARTIAL", positionHealth: "HEALTHY", positionConfidence: 100, createdTimestamp: 2 };
assert.deepEqual(await repository.storePositions([position], 7), { positionsInserted: 1, existingPositions: 0 });
const insert = database.transactions.at(-1)[0]; assert.match(insert.sql, /accounting_inventory_positions/); assert.equal((insert.sql.match(/\?/g) ?? []).length, insert.bind.length);
await repository.storeDiagnostics([{ id: "diag", positionVersion: 1, reasonCode: "negative_remaining_quantity", itemId: "1", itemUid: null, positionId: position.id, supportingQuantity: -1, supportingBasis: null, detail: "bad", timestamp: 2 }], 7);
await repository.pruneVersion(1, 7); const prune = database.transactions.at(-1).map((row) => row.sql).join("\n"); assert.doesNotMatch(prune, /accounting_cost_lots|accounting_fifo_consumptions/);
await repository.clearVersion(1); const clear = database.transactions.at(-1).map((row) => row.sql).join("\n"); assert.match(clear, /accounting_inventory_positions/); assert.doesNotMatch(clear, /accounting_cost_lots|accounting_fifo_consumptions|accounting_ledger/);
console.log("Inventory Position repository deterministic tests passed.");
