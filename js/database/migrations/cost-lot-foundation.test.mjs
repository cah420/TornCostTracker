import assert from "node:assert/strict";
import { migration008CostLotFoundation } from "./008-cost-lot-foundation.js";

const sql = migration008CostLotFoundation.statements.join("\n");
assert.equal(migration008CostLotFoundation.version, 8);
assert.match(sql, /CREATE TABLE accounting_lot_groups/);
assert.match(sql, /CREATE TABLE accounting_cost_lots/);
assert.match(sql, /CREATE TABLE accounting_cost_lot_dispositions/);
assert.match(sql, /CREATE TABLE accounting_cost_lot_runs/);
assert.match(sql, /UNIQUE\(cost_lot_version, source_ledger_transaction_id\)/);
assert.match(sql, /acquisition_sequence/);
assert.doesNotMatch(sql, /consumption_event|fifo_match/);
console.log("Cost Lot migration deterministic tests passed.");
