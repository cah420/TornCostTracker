import { API } from "../api.js";
import { Events } from "../events.js";
import { RawLogRepository } from "../database/raw-log-repository.js";
import { sha256Hex, stableStringify } from "./raw-log-serialization.js";

export const RAW_LOG_PAGE_SIZE = 100;
export const RAW_LOG_BATCH_SIZE = 100;

function numeric(value){
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}
function logCollection(response){
  const logs = response?.logs ?? response?.log;
  if (Array.isArray(logs)) return logs.map((rawLog) => ({ sourceLogId: rawLog?.id ?? rawLog?.log_id ?? null, rawLog }));
  if (logs && typeof logs === "object") return Object.entries(logs).map(([sourceLogId, rawLog]) => ({ sourceLogId: rawLog?.id ?? rawLog?.log_id ?? sourceLogId, rawLog }));
  if (logs === undefined || logs === null) return [];
  throw new Error("Torn returned an invalid user-log collection.");
}
function timestampFor(rawLog){ return numeric(rawLog?.timestamp ?? rawLog?.date ?? rawLog?.created_at); }
function typeFor(rawLog){ return rawLog?.details?.id ?? rawLog?.log ?? rawLog?.log_id ?? null; }
function titleFor(rawLog){ return String(rawLog?.details?.title ?? rawLog?.title ?? rawLog?.log_title ?? rawLog?.text ?? ""); }
function categoryFor(rawLog){ return rawLog?.category == null ? null : String(rawLog.category); }
function checkpointFor(records, { boundaryTimestamp, continuation, status = "running" } = {}){
  const timestamps = records.map((record) => record.eventTimestamp).filter((value) => value !== null);
  const timestamp = timestamps.length ? Math.min(...timestamps) : null;
  const ids = records.filter((record) => record.eventTimestamp === timestamp).map((record) => record.sourceLogId).sort();
  return { timestamp, logId: ids[0] ?? null, boundaryTimestamp, status, metadata: { continuation: continuation ?? null, boundaryLogIds: ids } };
}

/**
 * This service is the only new module which decodes Torn user-log response
 * shapes for archival. It deliberately never calls feature parsers or stores.
 */
export class RawLogImportService {
  constructor({ api = API, repository = new RawLogRepository(), hash = sha256Hex, now = () => Date.now(), batchSize = RAW_LOG_BATCH_SIZE } = {}){
    this.api = api; this.repository = repository; this.hash = hash; this.now = now; this.batchSize = batchSize;
    this.active = null;
  }

  publish(update){ Events.emit("rawLogImportProgress", update); }
  async availability(){
    const archive = await this.repository.archiveSummary();
    return { archive, latestRun: await this.repository.getLatestRun(), historicalCheckpoint: await this.repository.getCheckpoint("backward"), incrementalCheckpoint: await this.repository.getCheckpoint("forward") };
  }
  async recoverInterruptedRuns(){ await this.repository.markInterruptedRuns(); }
  pause(){ if (this.active) this.active.pauseRequested = true; }
  cancel(){ if (this.active) this.active.cancelRequested = true; }

  async startHistorical({ fromTimestamp = null, toTimestamp = null } = {}){
    return this.run({ mode: "historical", direction: "backward", fromTimestamp, toTimestamp, resume: false });
  }
  async resumeHistorical(){ return this.run({ mode: "historical", direction: "backward", resume: true }); }
  async incrementalSync(){ return this.run({ mode: "incremental", direction: "forward", resume: false }); }
  async retryLatest(){
    const latest = await this.repository.getLatestRun();
    if (!latest || !["failed", "paused", "cancelled"].includes(latest.status)) throw new Error("There is no paused, cancelled, or failed raw-log import to retry.");
    return latest.import_type === "historical" ? this.resumeHistorical() : this.incrementalSync();
  }

  async recordsFor(entries){
    return Promise.all(entries.map(async ({ sourceLogId, rawLog }) => {
      if (sourceLogId === null || sourceLogId === undefined || !rawLog || typeof rawLog !== "object") return null;
      const rawJson = stableStringify(rawLog);
      return { sourceLogId: String(sourceLogId), eventTimestamp: timestampFor(rawLog), logTypeId: typeFor(rawLog) == null ? null : String(typeFor(rawLog)), category: categoryFor(rawLog), title: titleFor(rawLog), rawJson, payloadHash: await this.hash(rawJson) };
    })).then((records) => records.filter(Boolean));
  }

  async run({ mode, direction, fromTimestamp = null, toTimestamp = null, resume }){
    if (this.active) throw new Error("A raw-log import is already running.");
    const previous = await this.repository.getCheckpoint(direction);
    if (resume && (!previous?.active_import_run_id || !["paused", "failed", "cancelled"].includes(previous.status))) {
      throw new Error("There is no paused, cancelled, or failed historical import to resume.");
    }
    let run;
    if (resume && previous?.active_import_run_id) run = await this.repository.resumeRun(previous.active_import_run_id);
    else {
      const archive = await this.repository.archiveSummary();
      const requestedFrom = mode === "incremental" ? archive.newestTimestamp : numeric(fromTimestamp);
      run = await this.repository.startRun({ importType: mode, requestedFrom, requestedTo: numeric(toTimestamp), startedAt: this.now() });
    }
    const state = this.active = { runId: run.id, pauseRequested: false, cancelRequested: false, startedAt: this.now() };
    const boundaryTimestamp = mode === "incremental" ? numeric(run.requested_from) : numeric(run.requested_from);
    let continuation = resume ? previous?.metadata?.continuation ?? null : null;
    let cursorTo = resume && !continuation ? previous?.cursor_timestamp ?? numeric(toTimestamp) : numeric(toTimestamp);
    let pagesFetched = Number(run.pages_fetched) || 0;
    let logsReceived = Number(run.logs_received) || 0;
    let logsInserted = Number(run.logs_inserted) || 0;
    let duplicates = Number(run.duplicates_detected) || 0;
    let conflicts = Number(run.conflicts_detected) || 0;
    this.publish({ importRunId: run.id, mode, status: "running", pagesFetched, logsReceived, logsInserted, duplicates, conflicts, elapsedMilliseconds: 0 });
    try {
      while (true) {
        if (state.cancelRequested || state.pauseRequested) break;
        const response = await this.api.getUserLogs({
          from: continuation ? null : boundaryTimestamp,
          to: continuation ? null : cursorTo,
          limit: Math.min(RAW_LOG_PAGE_SIZE, Math.max(1, Number(this.batchSize) || RAW_LOG_BATCH_SIZE)),
          continuation,
        });
        const entries = logCollection(response);
        if (!entries.length) break;
        const records = await this.recordsFor(entries);
        // Timestamp-less records are still source evidence. Retain them rather
        // than treating an unfamiliar Torn shape as permission to discard data.
        const eligible = records.filter((record) => boundaryTimestamp === null || record.eventTimestamp === null || record.eventTimestamp >= boundaryTimestamp);
        const timestamps = eligible.map((record) => record.eventTimestamp).filter((value) => value !== null);
        const nextLink = response?._metadata?.links?.next ?? null;
        const checkpoint = checkpointFor(eligible, { boundaryTimestamp, continuation: nextLink });
        // Torn bounds this endpoint to 100 records. Keep one complete page in
        // one transaction so its continuation checkpoint can never skip an
        // uncommitted tail after a database error.
        const batchResult = await this.repository.insertBatch(eligible, {
          runId: run.id,
          direction,
          checkpoint,
          pageMetrics: { pagesFetched: 1, logsReceived: entries.length, oldestTimestamp: timestamps.length ? Math.min(...timestamps) : null, newestTimestamp: timestamps.length ? Math.max(...timestamps) : null },
        });
        pagesFetched += 1; logsReceived += entries.length; logsInserted += batchResult.inserted; duplicates += batchResult.duplicates; conflicts += batchResult.conflicts;
        this.publish({ importRunId: run.id, mode, status: "running", pagesFetched, logsReceived, logsInserted, duplicates, conflicts, oldestTimestampSeen: timestamps.length ? Math.min(...timestamps) : null, newestTimestampSeen: timestamps.length ? Math.max(...timestamps) : null, currentBatchSize: eligible.length, elapsedMilliseconds: this.now() - state.startedAt, lastCheckpointAt: this.now() });
        if (state.cancelRequested || state.pauseRequested) break;
        // Match the established purchase-sync behavior: Torn's next cursor is
        // authoritative and must be followed before timestamp fallback rules.
        if (nextLink) {
          continuation = nextLink;
          continue;
        }
        const oldest = timestamps.length ? Math.min(...timestamps) : null;
        if (oldest === null || (boundaryTimestamp !== null && oldest <= boundaryTimestamp)) break;
        // Timestamp fallback deliberately overlaps the boundary. The source
        // log ID uniqueness constraint absorbs that overlap without loss.
        if (cursorTo !== null && oldest >= cursorTo) break;
        cursorTo = oldest;
      }
      const finalStatus = state.cancelRequested ? "cancelled" : state.pauseRequested ? "paused" : "completed";
      await this.repository.finishRun(run.id, finalStatus, { stoppedAt: finalStatus === "completed" ? null : this.now() });
      const result = { importRunId: run.id, mode, status: finalStatus, pagesFetched, logsReceived, logsInserted, duplicates, conflicts, elapsedMilliseconds: this.now() - state.startedAt, archive: await this.repository.archiveSummary() };
      this.publish(result); Events.emit("rawLogImportCompleted", result); return result;
    } catch (error) {
      await this.repository.finishRun(run.id, "failed", { error: error.message, stoppedAt: this.now() });
      const failure = { importRunId: run.id, mode, status: "failed", error: error.message };
      this.publish(failure); Events.emit("rawLogImportFailed", failure); throw error;
    } finally { this.active = null; }
  }
}

export const RawLogs = new RawLogImportService();
