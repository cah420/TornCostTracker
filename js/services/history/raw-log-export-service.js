import { Events } from "../../events.js";
import { RawLogRepository } from "../../database/raw-log-repository.js";
import { RawLogRedactor } from "./raw-log-redactor.js";
import { CoverageIntelligence } from "./coverage-intelligence-service.js";

const PAGE_SIZE = 100;
function dateStamp(){ return new Date().toISOString().slice(0, 10); }
function safeName(value){ return String(value ?? "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48); }

export function validateExportFilters(filters = {}){
  const from = filters.fromTimestamp == null ? null : Number(filters.fromTimestamp);
  const to = filters.toTimestamp == null ? null : Number(filters.toTimestamp);
  if (from !== null && !Number.isFinite(from)) throw new Error("Export From date is invalid.");
  if (to !== null && !Number.isFinite(to)) throw new Error("Export To date is invalid.");
  if (from !== null && to !== null && from > to) throw new Error("Export From date must not be after Export To date.");
  const maximum = filters.maximum == null || filters.maximum === "" ? null : Number(filters.maximum);
  if (maximum !== null && (!Number.isInteger(maximum) || maximum < 1)) throw new Error("Maximum records must be a positive whole number.");
  const logTypeIds = String(filters.logTypeIds ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (logTypeIds.some((value) => !/^\d+$/.test(value))) throw new Error("Log type IDs must be comma-separated whole numbers.");
  return { ...filters, fromTimestamp: from, toTimestamp: to, maximum, logTypeIds, sortOrder: filters.sortOrder === "newest" ? "newest" : "oldest", processing: ["unsupported", "error"].includes(filters.processing) ? filters.processing : "all", titleSearch: String(filters.titleSearch ?? "").trim(), category: String(filters.category ?? "").trim(), sourceLogId: String(filters.sourceLogId ?? "").trim(), representativePerType: filters.representativePerType ? Math.max(1, Number(filters.representativePerType) || 1) : null };
}

export function exportFilename(filters, redactionMode){
  const suffix = filters.processing !== "all" ? filters.processing : filters.logTypeIds.length === 1 ? `type-${filters.logTypeIds[0]}` : "archive";
  return `torn-raw-logs-${redactionMode}-${safeName(suffix) || "archive"}-${dateStamp()}.jsonl`;
}

export class RawLogExportService {
  constructor({ repository = new RawLogRepository(), redactorFactory = () => new RawLogRedactor(), coverageProvider = null, pageSize = PAGE_SIZE } = {}){
    this.repository = repository; this.redactorFactory = redactorFactory; this.coverageProvider = coverageProvider; this.pageSize = pageSize; this.cancelRequested = false;
  }
  cancel(){ this.cancelRequested = true; }
  async count(filters){ return this.repository.countForExport(validateExportFilters(filters)); }
  async export({ filters = {}, redactionMode = "redacted", onProgress = null } = {}){
    const safeFilters = validateExportFilters(filters);
    if (!["redacted", "full"].includes(redactionMode)) throw new Error("Unknown export redaction mode.");
    this.cancelRequested = false;
    const count = await this.repository.countForExport(safeFilters);
    const startedAt = Date.now();
    const redactor = redactionMode === "redacted" ? this.redactorFactory() : null;
    const chunks = []; const coverage = this.coverageProvider ? await this.coverageProvider.dashboard() : null;
    const exportTimestamp = new Date().toISOString();
    const coverageByLogType = new Map((coverage?.signatures ?? []).map((row) => [String(row.logTypeId), { observedRecordCount: row.observedCount, observedSignatureCount: row.observedSignatures, parserStatus: row.status, parserFamily: row.family, representativeSignatures: String(row.payloadSignatures ?? "none").split(" | "), exportedExampleCount: 0, exportTimestamp }]));
    let cursor = null; let exported = 0; const perType = new Map();
    while (!this.cancelRequested && (safeFilters.maximum === null || exported < safeFilters.maximum)) {
      const rows = await this.repository.pageForExport(safeFilters, { cursor, limit: this.pageSize });
      if (!rows.length) break;
      for (const row of rows) {
        if (this.cancelRequested || (safeFilters.maximum !== null && exported >= safeFilters.maximum)) break;
        const typeKey = String(row.log_type_id ?? "unknown");
        if (safeFilters.representativePerType && (perType.get(typeKey) ?? 0) >= safeFilters.representativePerType) continue;
        const raw = JSON.parse(row.raw_json);
        const envelope = { _recordType: "raw_log", sourceLogId: row.source_log_id, eventTimestamp: row.event_timestamp, logTypeId: row.log_type_id, category: row.category, title: row.title, raw: redactor ? redactor.redact(raw) : raw, payloadHash: row.payload_hash, importedAt: row.imported_at, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at };
        chunks.push(`${JSON.stringify(envelope)}\n`);
        perType.set(typeKey, (perType.get(typeKey) ?? 0) + 1);
        if (coverageByLogType.has(typeKey)) coverageByLogType.get(typeKey).exportedExampleCount += 1;
        exported += 1;
      }
      cursor = { timestamp: rows.at(-1).event_timestamp, sourceLogId: rows.at(-1).source_log_id };
      const progress = { status: this.cancelRequested ? "cancelled" : "running", matching: count, exported, elapsedMilliseconds: Date.now() - startedAt };
      onProgress?.(progress); Events.emit("rawLogExportProgress", progress);
      if (rows.length < this.pageSize) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const cancelled = this.cancelRequested;
    const metadata = { _recordType: "export_metadata", application: "TornCostTracker", exportFormat: "raw-log-jsonl", exportFormatVersion: 2, createdAt: exportTimestamp, redactionMode, filters: { ...safeFilters, sourceLogId: safeFilters.sourceLogId || undefined }, sortOrder: safeFilters.sortOrder === "newest" ? "newest-first" : "oldest-first", recordCount: count, coverageByLogType: Object.fromEntries(coverageByLogType) };
    chunks.unshift(`${JSON.stringify(metadata)}\n`);
    const result = { status: cancelled ? "cancelled" : "completed", exported, matching: count, filename: exportFilename(safeFilters, redactionMode), blob: new Blob(chunks, { type: "application/x-ndjson;charset=utf-8" }) };
    Events.emit("rawLogExportCompleted", { ...result, blob: undefined });
    return result;
  }
}

export const RawLogExporter = new RawLogExportService({ coverageProvider: CoverageIntelligence });
