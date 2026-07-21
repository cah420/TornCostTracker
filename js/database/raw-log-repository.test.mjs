import assert from "node:assert/strict";
import { RawLogRepository } from "./raw-log-repository.js";

class RecordingDatabase {
  constructor(){ this.transactions = []; }
  async query(sql){
    if (sql.includes("FROM raw_logs WHERE source_log_id IN")) return [{ source_log_id: "duplicate", payload_hash: "same" }, { source_log_id: "conflict", payload_hash: "original" }];
    return [];
  }
  async transaction(statements){ this.transactions.push(statements); }
}

const database = new RecordingDatabase();
const repository = new RawLogRepository(database);
const result = await repository.insertBatch([
  { sourceLogId: "new", eventTimestamp: 10, logTypeId: "1", category: "Test", title: "New", rawJson: "{\"a\":1}", payloadHash: "new" },
  { sourceLogId: "duplicate", eventTimestamp: 11, logTypeId: "2", category: "Test", title: "Duplicate", rawJson: "{\"a\":2}", payloadHash: "same" },
  { sourceLogId: "conflict", eventTimestamp: 12, logTypeId: "3", category: "Test", title: "Conflict", rawJson: "{\"a\":3}", payloadHash: "changed" },
], { runId: 7, direction: "backward", checkpoint: { timestamp: 10, logId: "new", status: "running", metadata: {} }, pageMetrics: { pagesFetched: 1, logsReceived: 3, oldestTimestamp: 10, newestTimestamp: 12 } });

assert.deepEqual(result, { inserted: 1, duplicates: 1, conflicts: 1 });
assert.equal(database.transactions.length, 1, "the entire batch uses one transaction");
const sql = database.transactions[0].map((statement) => statement.sql).join("\n");
assert.match(sql, /INSERT INTO raw_logs/);
assert.match(sql, /UPDATE raw_logs SET last_seen_at/);
assert.match(sql, /INSERT INTO raw_log_conflicts/);
assert.match(sql, /INSERT INTO sync_checkpoints/);
assert.match(sql, /UPDATE log_import_runs/);
console.log("Raw-log repository deterministic transaction tests passed.");
