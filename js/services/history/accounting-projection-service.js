import { CanonicalEventRepository } from "../../database/canonical-event-repository.js";
import { AccountingProjectionRepository } from "../../database/accounting-projection-repository.js";
import { ACCOUNTING_PROJECTION_VERSION, ProjectionOutcome, projectCanonicalEvent } from "./accounting-projection.js";

function emptyMetrics(){ return { canonicalEventsExamined: 0, classified: 0, unprojectedCanonicalEvents: 0, projectable: 0, neutral: 0, unresolved: 0, ignored: 0, projectionErrors: 0, accountingReadyEvents: 0, classificationCoveragePercent: 0, safelyProjectableCoveragePercent: 0, accountingReadyCoveragePercent: 0, rowsInserted: 0, existingRows: 0, itemInMovements: 0, itemOutMovements: 0, cashInMovements: 0, cashOutMovements: 0, byFamily: {}, byClassification: {}, reconciliationBalanced: false, durationMilliseconds: 0 }; }
function increment(object, key, amount = 1){ object[key] = (object[key] ?? 0) + amount; }

/** Paged, deterministic projection rebuild. It consumes canonical payloads only. */
export class AccountingProjectionService {
  constructor({ canonicalEvents = new CanonicalEventRepository(), projections = new AccountingProjectionRepository(), projectionVersion = ACCOUNTING_PROJECTION_VERSION, pageSize = 250 } = {}){ this.canonicalEvents = canonicalEvents; this.projections = projections; this.projectionVersion = projectionVersion; this.pageSize = pageSize; this.running = false; }
  async rebuild({ onProgress = null } = {}){
    if (this.running) throw new Error("Accounting projection rebuild is already running.");
    this.running = true; const startedAt = Date.now(); const metrics = emptyMetrics(); const run = await this.projections.startRun({ projectionVersion: this.projectionVersion, startedAt });
    let timestamp = null; let id = null;
    try {
      onProgress?.({ status: "preparing", ...metrics });
      while (true) {
        const rows = await this.canonicalEvents.pageForProjection({ timestamp, id, limit: this.pageSize }); if (!rows.length) break;
        const records = rows.map((row) => projectCanonicalEvent(JSON.parse(row.canonical_payload_json), { projectionVersion: this.projectionVersion }));
        records.forEach((record) => {
          metrics.canonicalEventsExamined += 1; metrics.classified += 1; increment(metrics, record.outcome === ProjectionOutcome.projectionError ? "projectionErrors" : record.outcome); increment(metrics.byFamily, record.canonicalEventType); increment(metrics.byClassification, record.classification);
          if (record.outcome === ProjectionOutcome.projectable && !["deferred_allocation", "unknown_basis"].includes(record.basisStatus)) metrics.accountingReadyEvents += 1;
          record.projectedMovements.forEach((movement) => { if (movement.category === "item_in") metrics.itemInMovements += 1; if (movement.category === "item_out") metrics.itemOutMovements += 1; if (movement.category === "cash_in") metrics.cashInMovements += 1; if (movement.category === "cash_out") metrics.cashOutMovements += 1; });
        });
        const stored = await this.projections.storeBatch(records, { projectionVersion: this.projectionVersion }); metrics.rowsInserted += stored.inserted; metrics.existingRows += stored.existing;
        const last = rows.at(-1); timestamp = Number(last.event_timestamp); id = String(last.id); onProgress?.({ status: "projecting", ...metrics });
        if (rows.length < this.pageSize) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const outcomeTotal = metrics.projectable + metrics.neutral + metrics.unresolved + metrics.ignored + metrics.projectionErrors;
      const storedRows = await this.projections.countRows(this.projectionVersion); metrics.unprojectedCanonicalEvents = metrics.canonicalEventsExamined - metrics.classified; metrics.classificationCoveragePercent = metrics.canonicalEventsExamined ? Math.round((metrics.classified / metrics.canonicalEventsExamined) * 1000) / 10 : 0; metrics.safelyProjectableCoveragePercent = metrics.canonicalEventsExamined ? Math.round((metrics.projectable / metrics.canonicalEventsExamined) * 1000) / 10 : 0; metrics.accountingReadyCoveragePercent = metrics.canonicalEventsExamined ? Math.round((metrics.accountingReadyEvents / metrics.canonicalEventsExamined) * 1000) / 10 : 0; metrics.reconciliationBalanced = outcomeTotal === metrics.canonicalEventsExamined && metrics.unprojectedCanonicalEvents === 0 && storedRows === metrics.canonicalEventsExamined; metrics.storedProjectionRows = storedRows; metrics.durationMilliseconds = Date.now() - startedAt;
      await this.projections.finishRun(run.id, { status: "completed", metrics }); onProgress?.({ status: "complete", ...metrics }); return { status: "completed", runId: run.id, projectionVersion: this.projectionVersion, ...metrics };
    } catch (error) {
      metrics.durationMilliseconds = Date.now() - startedAt; await this.projections.finishRun(run.id, { status: "failed", metrics, errorSummary: error.message }); onProgress?.({ status: "failed", error: error.message, ...metrics }); throw error;
    } finally { this.running = false; }
  }
  async diagnostics(){
    const latestRun = await this.projections.latestRun(this.projectionVersion); const storedProjectionRows = await this.projections.countRows(this.projectionVersion); const metrics = latestRun?.metrics ?? emptyMetrics();
    const health = !latestRun ? "Not Run" : latestRun.status !== "completed" || !metrics.reconciliationBalanced || metrics.projectionErrors ? "Unhealthy" : metrics.unresolved ? "Warning" : "Healthy";
    return { projectionVersion: this.projectionVersion, latestRun, storedProjectionRows, metrics, health, unresolved: await this.projections.listDiagnostics(this.projectionVersion, ProjectionOutcome.unresolved), errors: await this.projections.listDiagnostics(this.projectionVersion, ProjectionOutcome.projectionError) };
  }
}

export const AccountingProjection = new AccountingProjectionService();
