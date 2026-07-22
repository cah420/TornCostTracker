import assert from "node:assert/strict";
import { CoverageSnapshotRepository } from "./coverage-snapshot-repository.js";
class MemoryDatabase { constructor(){ this.statements = []; } async transaction(statements){ this.statements.push(statements); } async query(){ return [{ created_at: 5, metrics_json: '{"observedRecords":4}', replay_json: '{"generated":2}' }]; } }
const database = new MemoryDatabase(); const repository = new CoverageSnapshotRepository(database);
await repository.save({ metrics: { observedRecords: 4 }, replay: { generated: 2 }, createdAt: 5 });
assert.match(database.statements[0][0].sql, /coverage_snapshots/);
assert.deepEqual(await repository.list(), [{ createdAt: 5, metrics: { observedRecords: 4 }, replay: { generated: 2 } }]);
console.log("Coverage snapshot repository deterministic tests passed.");
