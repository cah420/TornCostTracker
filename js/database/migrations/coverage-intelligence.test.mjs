import assert from "node:assert/strict";
import { migration005CoverageIntelligence } from "./005-coverage-intelligence.js";
const sql = migration005CoverageIntelligence.statements.join("\n");
assert.equal(migration005CoverageIntelligence.version, 5);
assert.match(sql, /CREATE TABLE coverage_snapshots/);
assert.match(sql, /metrics_json TEXT NOT NULL/);
console.log("Coverage intelligence migration deterministic tests passed.");
