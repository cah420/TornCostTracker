import assert from "node:assert/strict";
import { AccountingProjectionService } from "./accounting-projection-service.js";

const events = [
  { id: "canonical:a", event_timestamp: 1, canonical_payload_json: JSON.stringify({ id: "canonical:a", sourceLogId: "raw:a", eventTimestamp: 1, schemaVersion: 1, eventType: "acquisition", movements: [{ direction: "in", resourceType: "item", resourceId: "1", quantity: 1 }, { direction: "out", resourceType: "cash", amount: 10 }] }) },
  { id: "canonical:t", event_timestamp: 2, canonical_payload_json: JSON.stringify({ id: "canonical:t", sourceLogId: "raw:t", eventTimestamp: 2, schemaVersion: 1, eventType: "transfer", parserName: "trade", movements: [] }) },
];
class MemoryCanonicalEvents { async pageForProjection({ timestamp = null, id = null, limit }){ const start = timestamp === null ? 0 : events.findIndex((event) => event.event_timestamp === timestamp && event.id === id) + 1; return events.slice(start, start + limit); } }
class MemoryProjections {
  constructor(){ this.records = new Map(); this.runs = []; }
  async startRun(){ const run = { id: this.runs.length + 1 }; this.runs.push(run); return run; }
  async storeBatch(records){ const existing = records.filter((record) => this.records.has(record.id)).length; records.forEach((record) => this.records.set(record.id, record)); return { inserted: records.length - existing, existing }; }
  async countRows(){ return this.records.size; }
  async finishRun(id, result){ this.runs[id - 1] = { ...this.runs[id - 1], ...result }; }
  async latestRun(){ return null; }
  async listDiagnostics(){ return []; }
}
const projections = new MemoryProjections(); const service = new AccountingProjectionService({ canonicalEvents: new MemoryCanonicalEvents(), projections, pageSize: 1 });
const first = await service.rebuild();
assert.equal(first.canonicalEventsExamined, 2);
assert.equal(first.projectable, 1);
assert.equal(first.unresolved, 1);
assert.equal(first.rowsInserted, 2);
assert.equal(first.reconciliationBalanced, true);
const second = await service.rebuild();
assert.equal(second.rowsInserted, 0);
assert.equal(second.existingRows, 2);
assert.equal(projections.records.size, 2);
console.log("Accounting projection rebuild deterministic tests passed.");
