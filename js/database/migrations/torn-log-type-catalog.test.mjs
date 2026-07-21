import assert from "node:assert/strict";
import { migration004TornLogTypeCatalog } from "./004-torn-log-type-catalog.js";

const sql = migration004TornLogTypeCatalog.statements.join("\n");
assert.equal(migration004TornLogTypeCatalog.version, 4);
assert.match(sql, /CREATE TABLE torn_log_types/);
assert.match(sql, /active INTEGER NOT NULL DEFAULT 1/);
assert.match(sql, /CREATE TABLE torn_log_type_catalog_changes/);
console.log("Torn log-type catalog migration deterministic tests passed.");
