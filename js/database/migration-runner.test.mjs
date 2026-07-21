import assert from "node:assert/strict";
import { applyMigrations } from "./migration-runner.js";

const applied = [];
const database = {
  async query(){ return applied.map((version) => ({ version })); },
  async transaction(statements){
    const versionStatement = statements.find((statement) => typeof statement === "object" && statement.sql?.startsWith("INSERT INTO schema_migrations"));
    if (versionStatement) applied.push(versionStatement.bind[0]);
  },
};
const migrations = [
  { version: 1, name: "one", statements: ["CREATE TABLE one"] },
  { version: 2, name: "two", statements: ["CREATE TABLE two"] },
];
assert.deepEqual((await applyMigrations(database, migrations)).appliedVersions, [1, 2]);
assert.deepEqual((await applyMigrations(database, migrations)).appliedVersions, []);
console.log("Database migration-runner deterministic tests passed.");
