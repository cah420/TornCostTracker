import assert from "node:assert/strict";
import { ACCOUNTING_LEDGER_VERSION } from "./accounting-ledger.js";
import { ACCOUNTING_PROJECTION_VERSION } from "./accounting-projection.js";
import { COST_LOT_VERSION } from "./cost-lot.js";
import { FIFO_VERSION } from "./fifo-consumption.js";
import { FifoService } from "./fifo-service.js";

const itemLine = (id, direction, quantity) => ({ id, itemId: "1", itemUid: null, quantity, movementDirection: direction, lineSequence: 0, lineKind: "monetary", debitAmount: null, creditAmount: null });
function ledgerRow(id, timestamp, classification, lines, total = 0, status = "posted"){ return { id, ledgerVersion: ACCOUNTING_LEDGER_VERSION, sourceProjectionVersion: ACCOUNTING_PROJECTION_VERSION, sourceProjectionId: `p:${id}`, sourceCanonicalEventId: `c:${id}`, eventTimestamp: timestamp, accountingClassification: classification, projectionOutcome: "projectable", transactionStatus: status, balanceStatus: status === "posted" ? "balanced" : "not_monetary", debitTotal: total, creditTotal: total, policyCode: classification, lines, sourceMetadata: {} }; }
const ledgerRows = [ledgerRow("a", 1, "paid_acquisition", [itemLine("a-line", "in", 10)], 100), ledgerRow("d", 2, "paid_disposal", [itemLine("d-line", "out", 4)], 80), ledgerRow("t", 3, "trade_unresolved", [], 0, "unresolved")];
class LedgerMemory { async latestRun(){ return { status: "completed", metrics: { reconciliationBalanced: true } }; } async pageForCostLots(_version, { timestamp, id, limit }){ return ledgerRows.filter((row) => timestamp === null || row.eventTimestamp > timestamp || (row.eventTimestamp === timestamp && row.id > id)).slice(0, limit).map((row) => ({ id: row.id, event_timestamp: row.eventTimestamp, payload_json: JSON.stringify(row) })); } }
const sourceLot = { id: "lot1", lotGroupId: "group1", costLotVersion: COST_LOT_VERSION, sourceLedgerVersion: ACCOUNTING_LEDGER_VERSION, sourceLedgerTransactionId: "a", sourceProjectionId: "p:a", sourceCanonicalEventId: "c:a", itemId: "1", itemUid: null, originalQuantity: 10, lotStatus: "open", basisStatus: "known_allocated_basis", allocationStatus: "fully_allocated", allocatedBasis: 100, unitBasis: 10, acquisitionTimestamp: 1, acquisitionSequence: "000000000001:c:a:a:000000:lot1" };
class LotsMemory { async latestRun(){ return { status: "completed", metrics: { reconciliationBalanced: true } }; } async pageLotsForFifo(_version, itemId, { sequence }){ return itemId === "1" && sequence === null ? [{ id: sourceLot.id, acquisition_sequence: sourceLot.acquisitionSequence, payload: sourceLot }] : []; } async fifoSourceSummary(){ return { lots: 1, originalQuantity: sourceLot.originalQuantity }; } }
class FifoMemory {
  constructor(){ this.demands = new Map(); this.consumptions = new Map(); this.dispositions = new Map(); this.diagnostics = new Map(); this.run = null; }
  async startRun(){ this.run = { id: 1 }; return this.run; } async updateRunProgress(){ } async finishRun(_id, values){ this.run = { ...this.run, ...values, metrics: values.metrics }; } async latestRun(){ return this.run; }
  async storeDemands(rows){ return this.store(this.demands, rows, "demandsInserted", "existingDemands"); } async finalizeDemands(rows){ rows.forEach((row) => this.demands.set(row.id, row)); }
  async prepareConsumptionReplacement(fifoVersion, itemId){ const ids = new Set([...this.consumptions.values()].filter((row) => row.fifoVersion === fifoVersion && row.itemId === String(itemId)).map((row) => row.id)); [...this.consumptions.entries()].forEach(([id, row]) => { if (row.fifoVersion === fifoVersion && row.itemId === String(itemId)) this.consumptions.delete(id); }); return ids; }
  async storeConsumptions(rows, { knownExistingIds = null } = {}){ const result = { consumptionsInserted: 0, existingConsumptions: 0 }; rows.forEach((row) => { if (knownExistingIds?.has(row.id)) result.existingConsumptions += 1; else result.consumptionsInserted += 1; this.consumptions.set(row.id, row); }); return result; } async storeDispositions(rows){ return this.store(this.dispositions, rows, "dispositionsInserted", "existingDispositions"); } async storeDiagnostics(rows){ rows.forEach((row) => this.diagnostics.set(row.id, row)); }
  store(map, rows, inserted, existing){ const result = { [inserted]: 0, [existing]: 0 }; rows.forEach((row) => { if (map.has(row.id)) result[existing] += 1; else { map.set(row.id, row); result[inserted] += 1; } }); return result; }
  async countRows(){ return { demands: this.demands.size, consumptions: this.consumptions.size, dispositions: this.dispositions.size, diagnostics: this.diagnostics.size }; }
  async listDemands(){ return [...this.demands.values()]; } async listConsumptions(){ return [...this.consumptions.values()]; } async listDerivedLotStates(){ return []; } async listDiagnostics(){ return [...this.diagnostics.values()]; }
}
const fifo = new FifoMemory(); const service = new FifoService({ ledger: new LedgerMemory(), costLots: new LotsMemory(), fifo, pageSize: 2 }); const first = await service.rebuild(); const second = await service.rebuild();
assert.equal(first.ledgerTransactionsExamined, 3); assert.equal(first.disposalTransactionsEligible, 1); assert.equal(first.disposalDemandsGenerated, 1); assert.equal(first.disposalQuantityDemanded, 4); assert.equal(first.disposalQuantityMatched, 4); assert.equal(first.consumptionRecordsGenerated, 1); assert.equal(first.knownConsumedBasis, 40); assert.equal(first.derivedRemainingQuantity, 6); assert.equal(first.reconciliationBalanced, true); assert.equal(first.demandsInserted, 1); assert.equal(first.consumptionsInserted, 1); assert.equal(first.dispositionsInserted, 3);
assert.equal(second.demandsInserted, 0); assert.equal(second.consumptionsInserted, 0); assert.equal(second.dispositionsInserted, 0); assert.equal(second.existingDemands, 1); assert.equal(second.existingConsumptions, 1); assert.equal(second.existingDispositions, 3); assert.equal(second.reconciliationBalanced, true);
const priorConsumptionId = [...fifo.consumptions.keys()][0];
sourceLot.originalQuantity = 3; sourceLot.allocatedBasis = 30;
const changedSupply = await service.rebuild();
assert.equal(changedSupply.consumptionsInserted, 1, "changed allocation creates its revised deterministic identity");
assert.equal(changedSupply.reconciliationBalanced, true);
assert.equal(fifo.consumptions.size, 1, "the prior natural-key row is replaced rather than retained");
assert.notEqual([...fifo.consumptions.keys()][0], priorConsumptionId);
assert.equal([...fifo.consumptions.values()][0].consumedQuantity, 3);
const changedSupplyReplay = await service.rebuild();
assert.equal(changedSupplyReplay.consumptionsInserted, 0);
assert.equal(changedSupplyReplay.existingConsumptions, 1);
assert.equal(fifo.consumptions.size, 1);
const diagnostics = await service.diagnostics(); assert.equal(diagnostics.health, "Warning"); assert.equal(diagnostics.fifoVersion, FIFO_VERSION); assert.equal(diagnostics.sourceCostLotVersion, COST_LOT_VERSION); assert.equal(diagnostics.sourceLedgerVersion, ACCOUNTING_LEDGER_VERSION);
console.log("FIFO paged rebuild and idempotency tests passed.");
