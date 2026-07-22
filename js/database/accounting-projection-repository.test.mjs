import assert from "node:assert/strict";
import { AccountingProjectionRepository } from "./accounting-projection-repository.js";

class MemoryDatabase {
  constructor(){ this.queries = []; this.transactions = []; }
  async query(sql, bind = []){ this.queries.push({ sql, bind }); if (sql.includes("WHERE id IN")) return [{ id: "projection:1:existing" }]; if (sql.includes("ORDER BY id DESC LIMIT 1")) return [{ id: 1 }]; if (sql.includes("COUNT(*)")) return [{ count: 2 }]; return []; }
  async transaction(statements){ this.transactions.push(statements); }
}
const database = new MemoryDatabase(); const repository = new AccountingProjectionRepository(database);
const run = await repository.startRun({ projectionVersion: 1, startedAt: 1 });
assert.equal(run.id, 1);
const records = [
  { id: "projection:1:new", canonicalEventId: "canonical:new", canonicalEventVersion: 1, canonicalEventType: "acquisition", classification: "paid_acquisition", outcome: "projectable", eventTimestamp: 1 },
  { id: "projection:1:existing", canonicalEventId: "canonical:existing", canonicalEventVersion: 1, canonicalEventType: "transfer", classification: "transfer_neutral", outcome: "neutral", eventTimestamp: 2 },
];
const stored = await repository.storeBatch(records, { projectionVersion: 1, now: 2 });
assert.deepEqual(stored, { inserted: 1, existing: 1 });
const sql = database.transactions.at(-1).map((statement) => statement.sql).join("\n");
assert.match(sql, /INSERT INTO accounting_projections/);
assert.match(sql, /ON CONFLICT\(id\)/);
await repository.clearVersion(1);
assert.match(database.transactions.at(-1)[0].sql, /DELETE FROM accounting_projections/);
console.log("Accounting projection repository deterministic tests passed.");
