import assert from "node:assert/strict";
import { LogTypeCatalogRepository } from "./log-type-catalog-repository.js";

class RecordingDatabase {
  constructor(rows){ this.rows = rows; this.transactions = []; }
  async query(){ return this.rows; }
  async transaction(statements){ this.transactions.push(statements); }
}

const database = new RecordingDatabase([
  { log_type_id: "1", title: "Old name", title_hash: "old", active: 1 },
  { log_type_id: "2", title: "Removed", title_hash: "removed", active: 1 },
  { log_type_id: "3", title: "Same", title_hash: "same", active: 1 },
]);
const repository = new LogTypeCatalogRepository(database);
const summary = await repository.refresh([
  { logTypeId: "1", title: "New name", titleHash: "new" },
  { logTypeId: "3", title: "Same", titleHash: "same" },
  { logTypeId: "4", title: "Added", titleHash: "added" },
], { importedAt: 42, sourceVersion: "fixture" });
assert.deepEqual(summary, { newIds: 1, renamedIds: 1, removedIds: 1, unchanged: 1, catalogTotal: 3 });
const sql = database.transactions[0].map((statement) => statement.sql).join("\n");
assert.match(sql, /change_kind, previous_title, current_title/);
assert.match(sql, /'renamed'/);
assert.match(sql, /'removed'/);
assert.match(sql, /active = 0/);
console.log("Torn log-type catalog repository deterministic tests passed.");
