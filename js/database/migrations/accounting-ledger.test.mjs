import assert from "node:assert/strict";
import { migration007AccountingLedger } from "./007-accounting-ledger.js";

const sql = migration007AccountingLedger.statements.join("\n");
assert.equal(migration007AccountingLedger.version, 7);
assert.match(sql, /CREATE TABLE accounting_ledger_accounts/);
assert.match(sql, /CREATE TABLE accounting_ledger_transactions/);
assert.match(sql, /CREATE TABLE accounting_ledger_lines/);
assert.match(sql, /CREATE TABLE accounting_ledger_runs/);
assert.match(sql, /UNIQUE\(source_projection_id, ledger_version\)/);
assert.match(sql, /idx_ledger_transactions_version/);
console.log("Accounting ledger migration deterministic tests passed.");
