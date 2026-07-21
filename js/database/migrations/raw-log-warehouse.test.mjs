import assert from "node:assert/strict";
import { migration002RawLogWarehouse } from "./002-raw-log-warehouse.js";

const schema = migration002RawLogWarehouse.statements.join("\n");
assert.match(schema, /CREATE TABLE raw_logs/);
assert.match(schema, /source_log_id TEXT NOT NULL UNIQUE/);
assert.match(schema, /raw_json TEXT NOT NULL/);
assert.match(schema, /CREATE INDEX idx_raw_logs_event_timestamp/);
assert.match(schema, /CREATE TABLE log_import_runs/);
assert.match(schema, /CREATE TABLE sync_checkpoints/);
assert.match(schema, /CREATE TABLE raw_log_conflicts/);
assert.equal(migration002RawLogWarehouse.version, 2);
console.log("Raw-log warehouse migration deterministic tests passed.");
