import assert from "node:assert/strict";
import { migration009FifoConsumption } from "./009-fifo-consumption.js";
const sql = migration009FifoConsumption.statements.join("\n");
assert.equal(migration009FifoConsumption.version, 9);
assert.match(sql, /CREATE TABLE accounting_fifo_disposal_demands/); assert.match(sql, /CREATE TABLE accounting_fifo_consumptions/); assert.match(sql, /CREATE TABLE accounting_fifo_dispositions/); assert.match(sql, /CREATE TABLE accounting_fifo_diagnostics/); assert.match(sql, /CREATE TABLE accounting_fifo_runs/);
assert.match(sql, /source_lot_id/); assert.match(sql, /disposal_sequence/); assert.match(sql, /UNIQUE\(fifo_version, disposal_demand_id, source_lot_id, match_sequence_within_disposal\)/); assert.doesNotMatch(sql, /inventory_position|market_value/);
console.log("FIFO migration deterministic tests passed.");
