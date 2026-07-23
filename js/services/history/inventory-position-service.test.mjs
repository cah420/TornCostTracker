import assert from "node:assert/strict";
import { ACCOUNTING_LEDGER_VERSION } from "./accounting-ledger.js";
import { ACCOUNTING_PROJECTION_VERSION } from "./accounting-projection.js";
import { COST_LOT_VERSION } from "./cost-lot.js";
import { FIFO_VERSION } from "./fifo-consumption.js";
import { InventoryPositionService } from "./inventory-position-service.js";

const lots = [
  { id: "lot-a", costLotVersion: COST_LOT_VERSION, sourceLedgerVersion: ACCOUNTING_LEDGER_VERSION, sourceProjectionVersion: ACCOUNTING_PROJECTION_VERSION, itemId: "1", itemUid: null, originalQuantity: 10, lotStatus: "open", basisStatus: "known_allocated_basis", allocationStatus: "fully_allocated", allocatedBasis: 100, unitBasis: 10, acquisitionTimestamp: 1, acquisitionSequence: "1:a" },
  { id: "lot-b", costLotVersion: COST_LOT_VERSION, sourceLedgerVersion: ACCOUNTING_LEDGER_VERSION, sourceProjectionVersion: ACCOUNTING_PROJECTION_VERSION, itemId: "2", itemUid: "uid-2", originalQuantity: 1, lotStatus: "open", basisStatus: "known_no_cash_consideration", allocationStatus: "allocation_unknown", allocatedBasis: null, unitBasis: null, acquisitionTimestamp: 2, acquisitionSequence: "2:b" },
];
class LotsMemory {
  constructor(){ this.mutations = 0; }
  async latestRun(){ return { status: "completed", metrics: { reconciliationBalanced: true } }; }
  async pageLotsForInventoryPosition(_version, { timestamp, limit }){ return timestamp === null ? lots.slice(0, limit).map((row) => ({ id: row.id, acquisition_timestamp: row.acquisitionTimestamp, payload: structuredClone(row) })) : []; }
}
class FifoMemory {
  constructor(){ this.mutations = 0; }
  async latestRun(){ return { status: "completed", source_cost_lot_version: COST_LOT_VERSION, source_ledger_version: ACCOUNTING_LEDGER_VERSION, fifo_version: FIFO_VERSION, metrics: { reconciliationBalanced: true } }; }
  async positionWarnings(){ return []; }
  async inventoryPositionSourceSummary(){ return { consumptionCount: 1, consumedQuantity: 4, orphanCount: 0 }; }
  async consumptionSummariesForLots(){ return new Map([["lot-a", { consumptionCount: 1, consumedQuantity: 4, consumedBasis: 40, nullBasisCount: 0 }]]); }
}
class PositionMemory {
  constructor(){ this.rows = new Map(); this.diagnosticsRows = new Map(); this.run = null; this.nextRun = 1; }
  async startRun(values){ this.run = { id: this.nextRun++, ...values, status: "running" }; return this.run; }
  async updateRunProgress(){ }
  async finishRun(_id, values){ this.run = { ...this.run, ...values, metrics: values.metrics }; }
  async latestRun(){ return this.run; }
  async storePositions(rows, runId){ let inserted = 0; let existing = 0; rows.forEach((row) => { if (this.rows.has(row.id)) existing++; else inserted++; this.rows.set(row.id, { ...row, runId }); }); return { positionsInserted: inserted, existingPositions: existing }; }
  async storeDiagnostics(rows, runId){ rows.forEach((row) => this.diagnosticsRows.set(row.id, { ...row, runId })); }
  async pruneVersion(_version, runId){ this.rows.forEach((row, id) => { if (row.runId !== runId) this.rows.delete(id); }); this.diagnosticsRows.forEach((row, id) => { if (row.runId !== runId) this.diagnosticsRows.delete(id); }); }
  async countRows(){ return { positions: this.rows.size, diagnostics: this.diagnosticsRows.size }; }
  async listPositions(){ return [...this.rows.values()]; }
  async listDiagnostics(){ return [...this.diagnosticsRows.values()]; }
}
const costLots = new LotsMemory(); const fifo = new FifoMemory(); const positions = new PositionMemory(); const service = new InventoryPositionService({ costLots, fifo, positions, pageSize: 1_000 });
const first = await service.rebuild(); const second = await service.rebuild();
assert.equal(first.lotsExamined, 2); assert.equal(first.consumptionsExamined, 1); assert.equal(first.positionsGenerated, 2); assert.equal(first.positionsInserted, 2); assert.equal(first.originalQuantity, 11); assert.equal(first.consumedQuantity, 4); assert.equal(first.remainingQuantity, 7); assert.equal(first.knownBasis, 60); assert.equal(first.reconciliationBalanced, true);
assert.equal(first.remainingBasis, 60); assert.equal(first.remainingBasisComplete, true);
assert.equal(first.averageConfidence, 100); assert.equal(first.medianConfidence, 100); assert.deepEqual(first.confidenceDistribution, { "100": 2, "95-99": 0, "90-94": 0, "85-89": 0, "80-84": 0, "75-79": 0, "70-74": 0, "0-69": 0 });
assert.deepEqual(first.classificationRuleHistogram, { partial_lot: 1, fully_reconciled: 1 }); assert.deepEqual(first.warningReasonHistogram, {}); assert.deepEqual(first.unknownReasonHistogram, {});
assert.equal(second.positionsInserted, 0); assert.equal(second.existingPositions, 2); assert.equal(second.reconciliationBalanced, true); assert.equal(positions.rows.size, 2);
assert.equal(costLots.mutations, 0); assert.equal(fifo.mutations, 0);
const diagnostics = await service.diagnostics(); assert.equal(diagnostics.health, "Healthy"); assert.equal(diagnostics.positionVersion, 1);
assert.equal(diagnostics.classificationCalibrationAvailable, true);
console.log("Inventory Position paged rebuild, reconciliation, isolation, and idempotency tests passed.");
