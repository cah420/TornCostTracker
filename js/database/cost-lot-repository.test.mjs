import assert from "node:assert/strict";
import { CostLotRepository } from "./cost-lot-repository.js";

class DatabaseMock {
  constructor(){ this.queries = []; this.transactions = []; }
  async query(sql, bind = []){ this.queries.push({ sql, bind }); if (sql.includes("SELECT id FROM")) return []; if (sql.includes("COUNT(*)")) return [{ count: 0 }]; if (sql.includes("accounting_cost_lot_runs")) return [{ id: 1, metrics_json: "{}", status: "running" }]; return []; }
  async transaction(statements){ this.transactions.push(statements); }
}
const database = new DatabaseMock(); const repository = new CostLotRepository(database);
const disposition = { id: "d1", costLotVersion: 1, sourceLedgerVersion: 1, sourceLedgerTransactionId: "t1", disposition: "lots_created", reasonCode: "paid_acquisition_fully_allocated" };
const group = { id: "g1", costLotVersion: 1, sourceLedgerVersion: 1, sourceProjectionVersion: 1, sourceLedgerTransactionId: "t1", sourceProjectionId: "p1", sourceCanonicalEventId: "c1", eventTimestamp: 1, groupType: "paid_acquisition", groupStatus: "open", basisStatus: "known_allocated_basis", allocationStatus: "fully_allocated", originalTotalBasis: 10, allocatedTotalBasis: 10, unallocatedTotalBasis: 0, lotCount: 1, originalTotalQuantity: 1, remainingTotalQuantity: 1 };
const lot = { id: "l1", lotGroupId: "g1", costLotVersion: 1, sourceLedgerVersion: 1, sourceLedgerTransactionId: "t1", sourceLedgerLineId: "line1", sourceProjectionId: "p1", sourceCanonicalEventId: "c1", itemId: "1", itemUid: null, originalQuantity: 1, remainingQuantity: 1, consumedQuantity: 0, lotStatus: "open", basisStatus: "known_allocated_basis", allocationStatus: "fully_allocated", originalTotalBasis: 10, allocatedBasis: 10, unallocatedBasis: 0, unitBasis: 10, acquisitionTimestamp: 1, acquisitionSequence: "sequence", occurrenceSequence: 0 };
const stored = await repository.storeBatch([{ disposition, group, lots: [lot] }]);
assert.deepEqual(stored, { groupsInserted: 1, existingGroups: 0, lotsInserted: 1, existingLots: 0, dispositionsInserted: 1, existingDispositions: 0 });
const sql = database.transactions.at(-1).map((statement) => statement.sql).join("\n");
assert.match(sql, /INSERT INTO accounting_lot_groups/); assert.match(sql, /INSERT INTO accounting_cost_lots/); assert.match(sql, /INSERT INTO accounting_cost_lot_dispositions/);
await repository.clearVersion(1); const clearSql = database.transactions.at(-1).map((statement) => statement.sql).join("\n"); assert.match(clearSql, /DELETE FROM accounting_cost_lot_dispositions/); assert.match(clearSql, /DELETE FROM accounting_cost_lots/); assert.match(clearSql, /DELETE FROM accounting_lot_groups/); assert.doesNotMatch(clearSql, /accounting_ledger_transactions/);
console.log("Cost Lot repository deterministic tests passed.");
