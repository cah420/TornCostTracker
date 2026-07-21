import assert from "node:assert/strict";
import { RawLogImportService } from "./raw-log-import-service.js";
import { stableStringify } from "./raw-log-serialization.js";

class MemoryRepository {
  constructor(){ this.logs = new Map(); this.conflicts = []; this.runs = []; this.checkpoints = new Map(); }
  async archiveSummary(){
    const timestamps = [...this.logs.values()].map((log) => log.eventTimestamp).filter(Number.isFinite);
    return { totalRawLogs: this.logs.size, oldestTimestamp: timestamps.length ? Math.min(...timestamps) : null, newestTimestamp: timestamps.length ? Math.max(...timestamps) : null, conflictCount: this.conflicts.length };
  }
  async getCheckpoint(direction){ return this.checkpoints.get(direction) ?? null; }
  async getLatestRun(){ return this.runs.at(-1) ?? null; }
  async getRun(id){ return this.runs.find((run) => run.id === id) ?? null; }
  async startRun({ importType, requestedFrom, requestedTo, startedAt }){ const run = { id: this.runs.length + 1, import_type: importType, status: "running", requested_from: requestedFrom, requested_to: requestedTo, started_at: startedAt, pages_fetched: 0, logs_received: 0, logs_inserted: 0, duplicates_detected: 0, conflicts_detected: 0 }; this.runs.push(run); return run; }
  async resumeRun(id){ const run = await this.getRun(id); run.status = "running"; return run; }
  async markInterruptedRuns(){}
  async finishRun(id, status){ const run = await this.getRun(id); run.status = status; const checkpoint = [...this.checkpoints.values()].find((entry) => entry.active_import_run_id === id); if (checkpoint) checkpoint.status = status; }
  async insertBatch(records, { runId, direction, checkpoint, pageMetrics }){
    let inserted = 0; let duplicates = 0; let conflicts = 0;
    records.forEach((record) => {
      const existing = this.logs.get(record.sourceLogId);
      if (!existing) { this.logs.set(record.sourceLogId, record); inserted += 1; }
      else if (existing.payloadHash === record.payloadHash) duplicates += 1;
      else { this.conflicts.push(record); conflicts += 1; }
    });
    const run = await this.getRun(runId); run.pages_fetched += pageMetrics.pagesFetched; run.logs_received += pageMetrics.logsReceived; run.logs_inserted += inserted; run.duplicates_detected += duplicates; run.conflicts_detected += conflicts;
    this.checkpoints.set(direction, { cursor_timestamp: checkpoint.timestamp, active_import_run_id: runId, metadata: checkpoint.metadata, status: checkpoint.status });
    return { inserted, duplicates, conflicts };
  }
}

const log = (timestamp, title = "Unknown event") => ({ log: 9999, timestamp, title, category: "Test", data: { arbitrary: true } });
const pages = [
  { log: { newest: log(300), tied: log(300) }, _metadata: { links: { next: "https://api.torn.com/v2/user/log?continuation=next" } } },
  { log: { older: log(299) }, _metadata: { links: {} } },
];
let call = 0;
const repository = new MemoryRepository();
const service = new RawLogImportService({ api: { getUserLogs: async () => pages[call++] ?? { log: {} } }, repository, hash: async (json) => `hash:${json}`, now: (() => { let now = 1000; return () => ++now; })() });
const first = await service.startHistorical({ fromTimestamp: 200 });
assert.equal(first.status, "completed");
assert.equal(repository.logs.size, 3, "unknown log types are archived unchanged");
assert.equal(first.pagesFetched, 2, "continuation pages are archived in sequence");
assert.equal(JSON.parse(repository.logs.get("newest").rawJson).title, "Unknown event", "full raw payload is retained");

const fallbackRepository = new MemoryRepository();
const fallbackRequests = [];
const fallbackPages = [
  { log: { first: log(400), second: log(399) }, _metadata: { links: {} } },
  { log: { third: log(398) }, _metadata: { links: {} } },
  { log: {} },
];
let fallbackCall = 0;
const fallbackService = new RawLogImportService({
  api: { getUserLogs: async (request) => { fallbackRequests.push(request); return fallbackPages[fallbackCall++]; } },
  repository: fallbackRepository,
  hash: async (json) => `hash:${json}`,
});
const fallback = await fallbackService.startHistorical({ fromTimestamp: 300 });
assert.equal(fallback.pagesFetched, 2, "timestamp fallback fetches older pages when Torn omits a continuation link");
assert.equal(fallbackRepository.logs.size, 3);
assert.equal(fallbackRequests[1].to, 399, "the fallback overlaps the oldest page timestamp");

call = 0;
const duplicate = await service.startHistorical({ fromTimestamp: 200 });
assert.equal(duplicate.duplicates, 3, "overlapping re-imports are idempotent");
assert.equal(repository.logs.size, 3);

pages[0] = { log: { newest: { ...log(300), title: "Changed source payload" } }, _metadata: { links: {} } };
call = 0;
const conflict = await service.startHistorical({ fromTimestamp: 200 });
assert.equal(conflict.conflicts, 1, "same source ID with a changed payload is a durable conflict");
assert.equal(JSON.parse(repository.logs.get("newest").rawJson).title, "Unknown event", "original evidence is not overwritten");

assert.equal(stableStringify({ b: 1, a: { d: null, c: 2 } }), stableStringify({ a: { c: 2, d: null }, b: 1 }), "canonical serialization ignores object property order");

const pausedRepository = new MemoryRepository();
let pauseCalls = 0;
let pausedService;
pausedService = new RawLogImportService({
  api: { getUserLogs: async () => { pauseCalls += 1; if (pauseCalls === 1) pausedService.pause(); return { log: { saved: log(50) }, _metadata: { links: {} } }; } },
  repository: pausedRepository,
  hash: async (json) => `hash:${json}`,
});
const paused = await pausedService.startHistorical();
assert.equal(paused.status, "paused", "pause occurs only after the current committed page");
assert.equal(pausedRepository.logs.size, 1, "paused imports retain committed evidence");
const resumed = await pausedService.resumeHistorical();
assert.equal(resumed.status, "completed", "a durable paused checkpoint can resume");
assert.equal(pausedRepository.logs.size, 1, "resume overlap remains duplicate-safe");

class FailingRepository extends MemoryRepository {
  async insertBatch(){ throw new Error("simulated transaction failure"); }
}
const failingRepository = new FailingRepository();
const failingService = new RawLogImportService({
  api: { getUserLogs: async () => ({ log: { uncommitted: log(10) }, _metadata: { links: {} } }) },
  repository: failingRepository,
  hash: async (json) => `hash:${json}`,
});
await assert.rejects(() => failingService.startHistorical(), /simulated transaction failure/);
assert.equal(failingRepository.logs.size, 0, "a failed archive batch leaves no partial source records");
assert.equal((await failingRepository.getLatestRun()).status, "failed");
console.log("Raw-log importer deterministic tests passed.");
