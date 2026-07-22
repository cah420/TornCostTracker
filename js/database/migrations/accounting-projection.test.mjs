import assert from "node:assert/strict";
import { migration006AccountingProjection } from "./006-accounting-projection.js";
const sql = migration006AccountingProjection.statements.join("\n");
assert.equal(migration006AccountingProjection.version, 6);
assert.match(sql, /CREATE TABLE accounting_projections/);
assert.match(sql, /CREATE TABLE accounting_projection_runs/);
assert.match(sql, /projection_version/);
console.log("Accounting projection migration deterministic tests passed.");
