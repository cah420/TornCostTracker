import { AccountingLedgerRepository } from "../../database/accounting-ledger-repository.js";
import { CostLotRepository } from "../../database/cost-lot-repository.js";
import { ACCOUNTING_LEDGER_VERSION } from "./accounting-ledger.js";
import { COST_LOT_VERSION, CostLotDisposition, buildCostLotDisposition } from "./cost-lot.js";

function blankMetrics(){ return { ledgerTransactionsExamined: 0, eligibleTransactions: 0, lotGroupsGenerated: 0, costLotsGenerated: 0, openLots: 0, deferredLots: 0, unresolvedTransactions: 0, ineligibleTransactions: 0, noItemEntryTransactions: 0, lotErrors: 0, originalQuantity: 0, remainingQuantity: 0, consumedQuantity: 0, eligibleSourceQuantity: 0, basisKnownQuantity: 0, fullyAllocatedQuantity: 0, fifoReadyQuantity: 0, deferredQuantity: 0, lotsWithUid: 0, lotsWithoutUid: 0, knownBasisTotal: 0, allocatedBasisTotal: 0, unallocatedBasisTotal: 0, groupsInserted: 0, existingGroups: 0, lotsInserted: 0, existingLots: 0, dispositionsInserted: 0, existingDispositions: 0, byDisposition: {}, byGroupStatus: {}, byLotStatus: {}, byGroupBasisStatus: {}, byLotBasisStatus: {}, byGroupAllocationStatus: {}, byLotAllocationStatus: {}, deferredReasons: {}, diagnosticReasons: {}, unresolvedReasons: {}, lotErrorReasons: {}, sourceDispositionCoveragePercent: 0, inventoryEntryCoveragePercent: 0, basisKnownCoveragePercent: 0, fullyAllocatedCoveragePercent: 0, fifoReadyCoveragePercent: 0, deferredAllocationRatePercent: 0, quantityReconciliationBalanced: false, basisReconciliationBalanced: false, sourceDispositionReconciliationBalanced: false, reconciliationBalanced: false, durationMilliseconds: 0, ledgerTransactionsPerSecond: 0, eligibleTransactionsPerSecond: 0, lotGroupsPerSecond: 0, costLotsPerSecond: 0 }; }
function increment(target, key, amount = 1){ target[key] = (target[key] ?? 0) + amount; }
function percent(numerator, denominator){ return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0; }
function positiveItemQuantity(transaction){ return (Array.isArray(transaction.lines) ? transaction.lines : []).filter((line) => line.movementDirection === "in" && Number.isInteger(line.quantity) && line.quantity > 0 && line.itemId !== null).reduce((sum, line) => sum + line.quantity, 0); }

export class CostLotService {
  constructor({ ledger = new AccountingLedgerRepository(), lots = new CostLotRepository(), costLotVersion = COST_LOT_VERSION, ledgerVersion = ACCOUNTING_LEDGER_VERSION, pageSize = 250 } = {}){ this.ledger = ledger; this.lots = lots; this.costLotVersion = costLotVersion; this.ledgerVersion = ledgerVersion; this.pageSize = pageSize; this.running = false; }
  async rebuild({ onProgress = null } = {}){
    if (this.running) throw new Error("Cost Lot rebuild is already running.");
    const sourceRun = await this.ledger.latestRun(this.ledgerVersion);
    if (!sourceRun || sourceRun.status !== "completed" || !sourceRun.metrics?.reconciliationBalanced) throw new Error("A completed, reconciled Accounting Ledger rebuild is required before Cost Lots can be rebuilt.");
    this.running = true; const startedAt = Date.now(); const metrics = blankMetrics(); const run = await this.lots.startRun({ costLotVersion: this.costLotVersion, sourceLedgerVersion: this.ledgerVersion, startedAt }); let timestamp = null; let id = null;
    try {
      onProgress?.({ phase: "preparing", ...metrics });
      while (true) {
        const rows = await this.ledger.pageForCostLots(this.ledgerVersion, { timestamp, id, limit: this.pageSize }); if (!rows.length) break;
        const transactions = rows.map((row) => { const parsed = JSON.parse(row.payload_json); return { ...parsed, id: parsed.id ?? row.id, eventTimestamp: Number.isInteger(parsed.eventTimestamp) ? parsed.eventTimestamp : Number(row.event_timestamp) }; }); const outputs = transactions.map(buildCostLotDisposition);
        outputs.forEach((output, index) => {
          const transaction = transactions[index]; const disposition = output.disposition.disposition; metrics.ledgerTransactionsExamined += 1; increment(metrics.byDisposition, disposition);
          if ([CostLotDisposition.lotsCreated, CostLotDisposition.deferredLotsCreated].includes(disposition)) metrics.eligibleTransactions += 1;
          if (disposition === CostLotDisposition.unresolved) { metrics.unresolvedTransactions += 1; increment(metrics.unresolvedReasons, output.disposition.reasonCode); }
          if (disposition === CostLotDisposition.ineligible) metrics.ineligibleTransactions += 1;
          if (disposition === CostLotDisposition.noItemEntry) metrics.noItemEntryTransactions += 1;
          if (disposition === CostLotDisposition.error) { metrics.lotErrors += 1; increment(metrics.lotErrorReasons, output.disposition.reasonCode); }
          if (["paid_acquisition", "non_cash_acquisition", "reward_non_cash", "conversion"].includes(transaction.accountingClassification)) metrics.eligibleSourceQuantity += positiveItemQuantity(transaction);
          if (output.group) {
            metrics.lotGroupsGenerated += 1; increment(metrics.byGroupStatus, output.group.groupStatus); increment(metrics.byGroupBasisStatus, output.group.basisStatus); increment(metrics.byGroupAllocationStatus, output.group.allocationStatus);
            metrics.knownBasisTotal += output.group.originalTotalBasis ?? 0; metrics.allocatedBasisTotal += output.group.allocatedTotalBasis ?? 0; metrics.unallocatedBasisTotal += output.group.unallocatedTotalBasis ?? 0;
            if (output.group.originalTotalBasis !== null) metrics.basisKnownQuantity += output.group.originalTotalQuantity;
            if (output.group.deferredReason) increment(metrics.deferredReasons, output.group.deferredReason);
            if (output.group.diagnosticReason) increment(metrics.diagnosticReasons, output.group.diagnosticReason);
          }
          output.lots.forEach((lot) => { metrics.costLotsGenerated += 1; metrics.originalQuantity += lot.originalQuantity; metrics.remainingQuantity += lot.remainingQuantity; metrics.consumedQuantity += lot.consumedQuantity; if (lot.lotStatus === "open") metrics.openLots += 1; if (lot.lotStatus === "deferred") { metrics.deferredLots += 1; metrics.deferredQuantity += lot.originalQuantity; } if (lot.allocationStatus === "fully_allocated") metrics.fullyAllocatedQuantity += lot.originalQuantity; if (lot.lotStatus === "open" && lot.allocationStatus === "fully_allocated" && lot.basisStatus === "known_allocated_basis" && lot.unitBasis !== null) metrics.fifoReadyQuantity += lot.originalQuantity; if (lot.itemUid) metrics.lotsWithUid += 1; else metrics.lotsWithoutUid += 1; increment(metrics.byLotStatus, lot.lotStatus); increment(metrics.byLotBasisStatus, lot.basisStatus); increment(metrics.byLotAllocationStatus, lot.allocationStatus); });
        });
        const stored = await this.lots.storeBatch(outputs); Object.entries(stored).forEach(([key, value]) => { metrics[key] += value; }); await this.lots.updateRunProgress(run.id, metrics);
        const last = rows.at(-1); timestamp = Number(last.event_timestamp); id = String(last.id); onProgress?.({ phase: "persisting", ...metrics }); if (rows.length < this.pageSize) break; await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const stored = await this.lots.countRows(this.costLotVersion); const dispositionTotal = Object.values(metrics.byDisposition).reduce((sum, value) => sum + value, 0);
      metrics.sourceDispositionCoveragePercent = percent(dispositionTotal, metrics.ledgerTransactionsExamined); metrics.inventoryEntryCoveragePercent = percent(metrics.originalQuantity, metrics.eligibleSourceQuantity);
      metrics.basisKnownCoveragePercent = percent(metrics.basisKnownQuantity, metrics.originalQuantity); metrics.fullyAllocatedCoveragePercent = percent(metrics.fullyAllocatedQuantity, metrics.originalQuantity); metrics.fifoReadyCoveragePercent = percent(metrics.fifoReadyQuantity, metrics.originalQuantity); metrics.deferredAllocationRatePercent = percent(metrics.deferredQuantity, metrics.originalQuantity);
      metrics.sourceDispositionReconciliationBalanced = dispositionTotal === metrics.ledgerTransactionsExamined && stored.dispositions === metrics.ledgerTransactionsExamined;
      metrics.quantityReconciliationBalanced = metrics.eligibleSourceQuantity === metrics.originalQuantity && metrics.originalQuantity === metrics.remainingQuantity && metrics.consumedQuantity === 0;
      metrics.basisReconciliationBalanced = metrics.knownBasisTotal === metrics.allocatedBasisTotal + metrics.unallocatedBasisTotal;
      metrics.reconciliationBalanced = metrics.sourceDispositionReconciliationBalanced && metrics.quantityReconciliationBalanced && metrics.basisReconciliationBalanced && stored.groups === metrics.lotGroupsGenerated && stored.lots === metrics.costLotsGenerated;
      metrics.storedGroups = stored.groups; metrics.storedLots = stored.lots; metrics.storedDispositions = stored.dispositions; metrics.durationMilliseconds = Date.now() - startedAt; const seconds = Math.max(metrics.durationMilliseconds / 1000, 0.001);
      metrics.ledgerTransactionsPerSecond = Math.round(metrics.ledgerTransactionsExamined / seconds); metrics.eligibleTransactionsPerSecond = Math.round(metrics.eligibleTransactions / seconds); metrics.lotGroupsPerSecond = Math.round(metrics.lotGroupsGenerated / seconds); metrics.costLotsPerSecond = Math.round(metrics.costLotsGenerated / seconds);
      await this.lots.finishRun(run.id, { status: "completed", metrics }); onProgress?.({ phase: "complete", ...metrics }); return { status: "completed", runId: run.id, costLotVersion: this.costLotVersion, sourceLedgerVersion: this.ledgerVersion, ...metrics };
    } catch (error) { metrics.durationMilliseconds = Date.now() - startedAt; await this.lots.finishRun(run.id, { status: "failed", metrics, errorSummary: error.message }); throw error; } finally { this.running = false; }
  }
  async diagnostics({ inspectionLimit = 10 } = {}){
    const latestRun = await this.lots.latestRun(this.costLotVersion); const stored = await this.lots.countRows(this.costLotVersion); const metrics = latestRun?.metrics ?? blankMetrics(); const unhealthy = latestRun && (latestRun.status !== "completed" || !metrics.reconciliationBalanced || metrics.lotErrors); const warning = latestRun && !unhealthy && (metrics.deferredLots || metrics.unresolvedTransactions);
    return { costLotVersion: this.costLotVersion, sourceLedgerVersion: this.ledgerVersion, latestRun, stored, metrics, health: !latestRun ? "Not Run" : unhealthy ? "Unhealthy" : warning ? "Warning" : "Healthy", groups: await this.lots.listGroups(this.costLotVersion, inspectionLimit), lots: await this.lots.listLots(this.costLotVersion, inspectionLimit), errors: await this.lots.listDispositions(this.costLotVersion, CostLotDisposition.error, inspectionLimit), unresolved: await this.lots.listDispositions(this.costLotVersion, CostLotDisposition.unresolved, inspectionLimit) };
  }
}
export const CostLots = new CostLotService();
