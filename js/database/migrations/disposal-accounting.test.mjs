import assert from "node:assert/strict";
import { migration012DisposalAccounting } from "./012-disposal-accounting.js";

const sql = migration012DisposalAccounting.statements.join("\n");
assert.equal(migration012DisposalAccounting.version, 12);
assert.match(sql, /CREATE TABLE disposal_resolutions/);
assert.match(sql, /UNIQUE\(source_transaction_id, resolution_version\)/);
assert.match(sql, /WHERE is_active = 1/);
assert.match(sql, /CREATE TABLE disposal_resolution_event_links/);
assert.match(sql, /CREATE TABLE accounting_realized_results/);
assert.match(sql, /UNIQUE\(fifo_version, source_consumption_id\)/);
console.log("Disposal Accounting migration constraints tests passed.");
