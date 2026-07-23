import { CostLotRepository } from "../../database/cost-lot-repository.js";
import { FifoRepository } from "../../database/fifo-repository.js";
import { InventoryPositionRepository } from "../../database/inventory-position-repository.js";
import { COST_LOT_VERSION } from "./cost-lot.js";
import { FIFO_VERSION } from "./fifo-consumption.js";
import { INVENTORY_POSITION_VERSION, addLotToInventoryPosition, createInventoryPositionAccumulator, finalizeInventoryPositions } from "./inventory-position.js";

function blankMetrics(){ return { lotsExamined: 0, consumptionsExamined: 0, positionsGenerated: 0, positionsInserted: 0, existingPositions: 0, stalePositionsRemoved: 0, healthyPositions: 0, warningPositions: 0, unhealthyPositions: 0, originalQuantity: 0, consumedQuantity: 0, remainingQuantity: 0, knownQuantity: 0, deferredQuantity: 0, unknownQuantity: 0, fifoReadyQuantity: 0, uidQuantity: 0, fungibleQuantity: 0, knownOriginalBasis: 0, knownConsumedBasis: 0, knownBasis: 0, remainingBasis: null, remainingBasisComplete: false, deferredBasisPositions: 0, openLots: 0, partiallyConsumedLots: 0, fullyConsumedLots: 0, diagnosticsGenerated: 0, sourceConsumptions: 0, sourceConsumptionQuantity: 0, orphanConsumptions: 0, byStatus: {}, byHealth: {}, confidenceDistribution: { "100": 0, "95-99": 0, "90-94": 0, "85-89": 0, "80-84": 0, "75-79": 0, "70-74": 0, "0-69": 0 }, averageConfidence: 0, medianConfidence: 0, highestConfidence: 0, lowestConfidence: 0, classificationRuleHistogram: {}, warningReasonHistogram: {}, warningCombinationHistogram: {}, unassignedEvidenceHistogram: {}, unknownReasonHistogram: {}, statusReasonHistogram: {}, confidenceDeductionStats: {}, confidenceDeductionCombinationHistogram: {}, diagnosticReasons: {}, quantityReconciliationBalanced: false, basisReconciliationBalanced: false, lotReconciliationBalanced: false, sourceReconciliationBalanced: false, positionReconciliationBalanced: false, reconciliationBalanced: false, durationMilliseconds: 0, lotsPerSecond: 0, positionsPerSecond: 0, peakBatchSize: 0 }; }
function add(target, key, amount = 1){ target[key] = (target[key] ?? 0) + amount; }
function sourceValue(row, snake, camel){ return row?.[snake] ?? row?.[camel] ?? null; }
function confidenceBucket(value){ return value === 100 ? "100" : value >= 95 ? "95-99" : value >= 90 ? "90-94" : value >= 85 ? "85-89" : value >= 80 ? "80-84" : value >= 75 ? "75-79" : value >= 70 ? "70-74" : "0-69"; }
function median(values){ if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) * 10 / 2) / 10; }

export class InventoryPositionService {
  constructor({ costLots = new CostLotRepository(), fifo = new FifoRepository(), positions = new InventoryPositionRepository(), positionVersion = INVENTORY_POSITION_VERSION, costLotVersion = COST_LOT_VERSION, fifoVersion = FIFO_VERSION, pageSize = 500 } = {}){
    this.costLots = costLots; this.fifo = fifo; this.positions = positions; this.positionVersion = positionVersion; this.costLotVersion = costLotVersion; this.fifoVersion = fifoVersion; this.pageSize = pageSize; this.running = false;
  }
  async rebuild({ onProgress = null } = {}){
    if (this.running) throw new Error("Inventory Position rebuild is already running.");
    const metrics = blankMetrics(); onProgress?.({ phase: "checking prerequisites", ...metrics });
    const [costLotRun, fifoRun] = await Promise.all([this.costLots.latestRun(this.costLotVersion), this.fifo.latestRun(this.fifoVersion)]);
    if (!costLotRun || costLotRun.status !== "completed" || !costLotRun.metrics?.reconciliationBalanced) throw new Error("A completed, reconciled Cost Lot rebuild is required before Inventory Position.");
    if (!fifoRun || fifoRun.status !== "completed" || !fifoRun.metrics?.reconciliationBalanced) throw new Error("A completed, reconciled FIFO rebuild is required before Inventory Position.");
    const fifoCostLotVersion = Number(sourceValue(fifoRun, "source_cost_lot_version", "sourceCostLotVersion"));
    const sourceLedgerVersion = Number(sourceValue(fifoRun, "source_ledger_version", "sourceLedgerVersion"));
    if (fifoCostLotVersion !== this.costLotVersion) throw new Error("FIFO and Cost Lot source versions do not match.");
    this.running = true; const startedAt = Date.now();
    const run = await this.positions.startRun({ positionVersion: this.positionVersion, sourceCostLotVersion: this.costLotVersion, sourceFifoVersion: this.fifoVersion, sourceLedgerVersion, startedAt });
    const context = createInventoryPositionAccumulator({ positionVersion: this.positionVersion, costLotVersion: this.costLotVersion, fifoVersion: this.fifoVersion });
    try {
      const [warnings, sourceSummary] = await Promise.all([this.fifo.positionWarnings(this.fifoVersion), this.fifo.inventoryPositionSourceSummary(this.fifoVersion, this.costLotVersion)]);
      metrics.sourceConsumptions = sourceSummary.consumptionCount; metrics.sourceConsumptionQuantity = sourceSummary.consumedQuantity; metrics.orphanConsumptions = sourceSummary.orphanCount;
      let timestamp = null; let id = null;
      while (true) {
        const page = await this.costLots.pageLotsForInventoryPosition(this.costLotVersion, { timestamp, id, limit: this.pageSize }); if (!page.length) break;
        const summaries = await this.fifo.consumptionSummariesForLots(this.fifoVersion, page.map((row) => row.id));
        page.forEach((row) => { addLotToInventoryPosition(context, row.payload, summaries.get(row.id) ?? {}); metrics.lotsExamined += 1; }); metrics.consumptionsExamined = context.consumptionsExamined;
        metrics.peakBatchSize = Math.max(metrics.peakBatchSize, page.length); const last = page.at(-1); timestamp = last.acquisition_timestamp; id = last.id;
        await this.positions.updateRunProgress(run.id, metrics); onProgress?.({ phase: "aggregating positions", ...metrics });
        if (page.length < this.pageSize) break; await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const result = finalizeInventoryPositions(context, warnings); metrics.consumptionsExamined = result.consumptionsExamined; metrics.positionsGenerated = result.positions.length;
      const positionIdentityKeys = new Set(result.positions.map((row) => `${row.itemId}:${row.itemUid ?? "fungible"}`)); warnings.filter((row) => !positionIdentityKeys.has(`${row.itemId}:${row.itemUid ?? "fungible"}`)).forEach((row) => { if (row.historicalShortfallQuantity) add(metrics.unassignedEvidenceHistogram, "historical_shortfall", row.historicalShortfallQuantity); if (row.uidAmbiguityCount) add(metrics.unassignedEvidenceHistogram, "uid_ambiguity", row.uidAmbiguityCount); });
      const projectionVersions = new Set(result.positions.map((row) => row.sourceProjectionVersion).filter((value) => Number.isInteger(value) && value > 0)); const sourceProjectionVersion = projectionVersions.size === 1 ? [...projectionVersions][0] : null;
      if (sourceSummary.orphanCount) result.diagnostics.push({ id: `inventory-position-diagnostic:${this.positionVersion}:global:missing_source_lot`, positionVersion: this.positionVersion, reasonCode: "missing_source_lot", itemId: null, itemUid: null, positionId: null, supportingQuantity: sourceSummary.orphanCount, supportingBasis: null, detail: `${sourceSummary.orphanCount} FIFO consumption records do not reference Cost Lot v${this.costLotVersion}.`, timestamp: 0 });
      if (projectionVersions.size > 1) result.diagnostics.push({ id: `inventory-position-diagnostic:${this.positionVersion}:global:unknown_projection_version`, positionVersion: this.positionVersion, reasonCode: "unknown_projection_version", itemId: null, itemUid: null, positionId: null, supportingQuantity: projectionVersions.size, supportingBasis: null, detail: "Cost Lots contain more than one source Projection version.", timestamp: 0 });
      metrics.diagnosticsGenerated = result.diagnostics.length;
      const confidenceValues = [];
      result.positions.forEach((position) => {
        metrics.originalQuantity += position.originalQuantity; metrics.consumedQuantity += position.consumedQuantity; metrics.remainingQuantity += position.remainingQuantity;
        metrics.knownQuantity += position.knownQuantity; metrics.deferredQuantity += position.deferredQuantity; metrics.unknownQuantity += position.unknownQuantity; metrics.fifoReadyQuantity += position.fifoReadyQuantity; metrics.uidQuantity += position.uidQuantity; metrics.fungibleQuantity += position.fungibleQuantity;
        metrics.knownOriginalBasis += position.knownOriginalBasis; metrics.knownConsumedBasis += position.knownConsumedBasis; metrics.knownBasis += position.knownBasis; if (position.deferredQuantity || position.unknownQuantity) metrics.deferredBasisPositions += 1;
        metrics.openLots += position.openLotCount; metrics.partiallyConsumedLots += position.partiallyConsumedLotCount; metrics.fullyConsumedLots += position.fullyConsumedLotCount;
        add(metrics.byStatus, position.positionStatus); add(metrics.byHealth, position.positionHealth); add(metrics.confidenceDistribution, confidenceBucket(position.positionConfidence));
        confidenceValues.push(position.positionConfidence); position.explanation.reasons.forEach((reason) => add(metrics.classificationRuleHistogram, reason.code)); position.explanation.warningReasons.forEach((reason) => add(metrics.warningReasonHistogram, reason));
        if (position.explanation.warningReasons.length) add(metrics.warningCombinationHistogram, [...position.explanation.warningReasons].sort().join("+"));
        add(metrics.statusReasonHistogram, position.explanation.status.reasons.join("+") || "none");
        if (position.positionStatus === "UNKNOWN") add(metrics.unknownReasonHistogram, position.explanation.status.reasons.join("+") || "unclassified");
        const deductionCombination = Object.keys(position.confidenceDeductions).sort().join("+"); if (deductionCombination) add(metrics.confidenceDeductionCombinationHistogram, deductionCombination);
        Object.entries(position.confidenceDeductions).forEach(([reason, deduction]) => { const stats = metrics.confidenceDeductionStats[reason] ?? { occurrences: 0, totalDeduction: 0, averageDeduction: 0, maximumDeduction: 0 }; stats.occurrences += 1; stats.totalDeduction += deduction; stats.maximumDeduction = Math.max(stats.maximumDeduction, deduction); metrics.confidenceDeductionStats[reason] = stats; });
        if (position.positionHealth === "HEALTHY") metrics.healthyPositions += 1; else if (position.positionHealth === "WARNING") metrics.warningPositions += 1; else metrics.unhealthyPositions += 1;
      });
      metrics.averageConfidence = confidenceValues.length ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) * 10 / confidenceValues.length) / 10 : 0; metrics.medianConfidence = median(confidenceValues); metrics.highestConfidence = confidenceValues.reduce((highest, value) => Math.max(highest, value), 0); metrics.lowestConfidence = confidenceValues.reduce((lowest, value) => Math.min(lowest, value), confidenceValues[0] ?? 0); Object.values(metrics.confidenceDeductionStats).forEach((stats) => { stats.averageDeduction = Math.round(stats.totalDeduction * 10 / stats.occurrences) / 10; });
      result.diagnostics.forEach((row) => add(metrics.diagnosticReasons, row.reasonCode));
      metrics.remainingBasisComplete = metrics.deferredQuantity === 0 && metrics.unknownQuantity === 0; metrics.remainingBasis = metrics.remainingBasisComplete ? metrics.knownBasis : null;
      for (let offset = 0; offset < result.positions.length; offset += this.pageSize) { const stored = await this.positions.storePositions(result.positions.slice(offset, offset + this.pageSize), run.id); metrics.positionsInserted += stored.positionsInserted; metrics.existingPositions += stored.existingPositions; }
      for (let offset = 0; offset < result.diagnostics.length; offset += this.pageSize) await this.positions.storeDiagnostics(result.diagnostics.slice(offset, offset + this.pageSize), run.id);
      const beforePrune = await this.positions.countRows(this.positionVersion); await this.positions.pruneVersion(this.positionVersion, run.id); const stored = await this.positions.countRows(this.positionVersion); metrics.stalePositionsRemoved = Math.max(0, beforePrune.positions - stored.positions);
      metrics.quantityReconciliationBalanced = metrics.originalQuantity === metrics.consumedQuantity + metrics.remainingQuantity;
      metrics.basisReconciliationBalanced = metrics.knownOriginalBasis === metrics.knownConsumedBasis + metrics.knownBasis;
      metrics.lotReconciliationBalanced = metrics.openLots + metrics.partiallyConsumedLots + metrics.fullyConsumedLots === metrics.lotsExamined;
      metrics.sourceReconciliationBalanced = metrics.orphanConsumptions === 0 && metrics.consumptionsExamined === metrics.sourceConsumptions && metrics.consumedQuantity === metrics.sourceConsumptionQuantity;
      metrics.positionReconciliationBalanced = stored.positions === metrics.positionsGenerated && stored.diagnostics === metrics.diagnosticsGenerated;
      metrics.reconciliationBalanced = metrics.quantityReconciliationBalanced && metrics.basisReconciliationBalanced && metrics.lotReconciliationBalanced && metrics.sourceReconciliationBalanced && metrics.positionReconciliationBalanced && metrics.unhealthyPositions === 0 && metrics.diagnosticsGenerated === 0;
      metrics.durationMilliseconds = Date.now() - startedAt; const seconds = Math.max(metrics.durationMilliseconds / 1000, 0.001); metrics.lotsPerSecond = Math.round(metrics.lotsExamined / seconds); metrics.positionsPerSecond = Math.round(metrics.positionsGenerated / seconds);
      await this.positions.finishRun(run.id, { status: "completed", metrics, sourceProjectionVersion }); onProgress?.({ phase: "complete", ...metrics });
      return { status: "completed", runId: run.id, positionVersion: this.positionVersion, sourceCostLotVersion: this.costLotVersion, sourceFifoVersion: this.fifoVersion, sourceLedgerVersion, sourceProjectionVersion, ...metrics };
    } catch (error) {
      metrics.durationMilliseconds = Date.now() - startedAt; await this.positions.finishRun(run.id, { status: "failed", metrics, errorSummary: error.message }); throw error;
    } finally { this.running = false; }
  }
  async diagnostics({ inspectionLimit = 10 } = {}){
    const latestRun = await this.positions.latestRun(this.positionVersion); const stored = await this.positions.countRows(this.positionVersion); const defaults = blankMetrics(); const rawMetrics = latestRun?.metrics ?? {}; const metrics = { ...defaults, ...rawMetrics, confidenceDistribution: { ...defaults.confidenceDistribution, ...(rawMetrics.confidenceDistribution ?? {}) }, classificationRuleHistogram: rawMetrics.classificationRuleHistogram ?? {}, warningReasonHistogram: rawMetrics.warningReasonHistogram ?? {}, warningCombinationHistogram: rawMetrics.warningCombinationHistogram ?? {}, unassignedEvidenceHistogram: rawMetrics.unassignedEvidenceHistogram ?? {}, unknownReasonHistogram: rawMetrics.unknownReasonHistogram ?? {}, statusReasonHistogram: rawMetrics.statusReasonHistogram ?? {}, confidenceDeductionStats: rawMetrics.confidenceDeductionStats ?? {}, confidenceDeductionCombinationHistogram: rawMetrics.confidenceDeductionCombinationHistogram ?? {} }; const classificationCalibrationAvailable = Object.hasOwn(rawMetrics, "classificationRuleHistogram");
    const unhealthy = latestRun && (latestRun.status !== "completed" || !metrics.reconciliationBalanced || metrics.unhealthyPositions); const warning = latestRun && !unhealthy && metrics.warningPositions;
    return { positionVersion: this.positionVersion, sourceCostLotVersion: this.costLotVersion, sourceFifoVersion: this.fifoVersion, sourceLedgerVersion: sourceValue(latestRun, "source_ledger_version", "sourceLedgerVersion"), sourceProjectionVersion: sourceValue(latestRun, "source_projection_version", "sourceProjectionVersion"), latestRun, stored, metrics, classificationCalibrationAvailable, health: !latestRun ? "Not Run" : unhealthy ? "Unhealthy" : warning ? "Warning" : "Healthy", positions: await this.positions.listPositions(this.positionVersion, { limit: inspectionLimit }), diagnostics: await this.positions.listDiagnostics(this.positionVersion, inspectionLimit) };
  }
}

export const InventoryPositions = new InventoryPositionService();
