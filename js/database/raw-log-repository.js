import { Database } from "./database-client.js";

const STREAM_NAME = "torn-user-logs";

function placeholders(count){ return Array.from({ length: count }, () => "?").join(", "); }
function number(value){ const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }

function exportWhere(filters, cursor = null){
  const conditions = []; const bind = [];
  if (filters.fromTimestamp !== null) { conditions.push("r.event_timestamp >= ?"); bind.push(filters.fromTimestamp); }
  if (filters.toTimestamp !== null) { conditions.push("r.event_timestamp <= ?"); bind.push(filters.toTimestamp); }
  if (filters.logTypeIds?.length) { conditions.push(`r.log_type_id IN (${placeholders(filters.logTypeIds.length)})`); bind.push(...filters.logTypeIds); }
  if (filters.category) { conditions.push("r.category = ?"); bind.push(filters.category); }
  if (filters.titleSearch) { conditions.push("LOWER(r.title) LIKE ?"); bind.push(`%${filters.titleSearch.toLowerCase()}%`); }
  if (filters.sourceLogId) { conditions.push("r.source_log_id = ?"); bind.push(filters.sourceLogId); }
  if (filters.processing !== "all") {
    conditions.push("EXISTS (SELECT 1 FROM processing_state p WHERE p.source_log_id = r.source_log_id AND p.status = ?)");
    bind.push(filters.processing);
  }
  if (cursor) {
    const comparison = filters.sortOrder === "newest" ? "<" : ">";
    conditions.push(`(r.event_timestamp ${comparison} ? OR (r.event_timestamp = ? AND r.source_log_id ${comparison} ?))`);
    bind.push(cursor.timestamp, cursor.timestamp, cursor.sourceLogId);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", bind };
}

/** SQLite-only archive repository. It intentionally contains no accounting rules. */
export class RawLogRepository {
  constructor(database = Database){ this.database = database; }

  async getBySourceLogId(sourceLogId){
    const rows = await this.database.query("SELECT * FROM raw_logs WHERE source_log_id = ?", [String(sourceLogId)]);
    return rows[0] ?? null;
  }

  async archiveSummary(){
    const [summary] = await this.database.query(`SELECT COUNT(*) AS totalRawLogs,
      MIN(event_timestamp) AS oldestTimestamp, MAX(event_timestamp) AS newestTimestamp
      FROM raw_logs`);
    const [conflicts] = await this.database.query("SELECT COUNT(*) AS conflictCount FROM raw_log_conflicts");
    return { totalRawLogs: number(summary?.totalRawLogs) ?? 0, oldestTimestamp: number(summary?.oldestTimestamp), newestTimestamp: number(summary?.newestTimestamp), conflictCount: number(conflicts?.conflictCount) ?? 0 };
  }

  async getCheckpoint(direction){
    const rows = await this.database.query("SELECT * FROM sync_checkpoints WHERE stream_name = ? AND direction = ?", [STREAM_NAME, direction]);
    const checkpoint = rows[0] ?? null;
    return checkpoint ? { ...checkpoint, metadata: checkpoint.metadata_json ? JSON.parse(checkpoint.metadata_json) : {} } : null;
  }

  async getLatestRun(){
    const rows = await this.database.query("SELECT * FROM log_import_runs ORDER BY id DESC LIMIT 1");
    return rows[0] ?? null;
  }

  async getRun(runId){
    const rows = await this.database.query("SELECT * FROM log_import_runs WHERE id = ?", [runId]);
    return rows[0] ?? null;
  }

  async resumeRun(runId){
    await this.database.transaction([{ sql: "UPDATE log_import_runs SET status = 'running', stopped_at = NULL, error_summary = NULL WHERE id = ?", bind: [runId] }]);
    return this.getRun(runId);
  }

  async startRun({ importType, requestedFrom = null, requestedTo = null, startedAt = Date.now() }){
    await this.database.transaction([{ sql: `INSERT INTO log_import_runs
      (import_type, status, started_at, requested_from, requested_to)
      VALUES (?, 'running', ?, ?, ?)`, bind: [importType, startedAt, requestedFrom, requestedTo] }]);
    const rows = await this.database.query("SELECT * FROM log_import_runs ORDER BY id DESC LIMIT 1");
    return rows[0];
  }

  async markInterruptedRuns(){
    const now = Date.now();
    await this.database.transaction([{ sql: `UPDATE log_import_runs SET status = 'paused', stopped_at = ?,
      error_summary = COALESCE(error_summary, 'Import interrupted by browser shutdown or refresh.')
      WHERE status = 'running'`, bind: [now] }, {
      sql: `UPDATE sync_checkpoints SET status = 'paused', updated_at = ?
        WHERE active_import_run_id IN (SELECT id FROM log_import_runs WHERE status = 'paused')`, bind: [now],
    }]);
  }

  async finishRun(runId, status, { error = null, stoppedAt = null } = {}){
    const now = Date.now();
    await this.database.transaction([{ sql: `UPDATE log_import_runs
      SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END,
        stopped_at = ?, error_summary = ? WHERE id = ?`,
      bind: [status, status, now, stoppedAt, error, runId] }, {
      sql: "UPDATE sync_checkpoints SET status = ?, updated_at = ? WHERE active_import_run_id = ?",
      bind: [status, now, runId],
    }]);
  }

  /**
   * One explicit SQLite transaction commits inserts, duplicate observations,
   * conflict diagnostics, cumulative run metrics, and the resume checkpoint.
   */
  async insertBatch(records, { runId, direction, checkpoint, pageMetrics = {} } = {}){
    if (!records.length) return { inserted: 0, duplicates: 0, conflicts: 0 };
    const ids = records.map((record) => record.sourceLogId);
    const existingRows = await this.database.query(`SELECT source_log_id, payload_hash FROM raw_logs WHERE source_log_id IN (${placeholders(ids.length)})`, ids);
    const existing = new Map(existingRows.map((row) => [String(row.source_log_id), row.payload_hash]));
    const newRecords = records.filter((record) => !existing.has(record.sourceLogId));
    const duplicateRecords = records.filter((record) => existing.get(record.sourceLogId) === record.payloadHash);
    const conflictRecords = records.filter((record) => existing.has(record.sourceLogId) && existing.get(record.sourceLogId) !== record.payloadHash);
    const now = Date.now();
    const statements = [];
    newRecords.forEach((record) => statements.push({ sql: `INSERT INTO raw_logs
      (source_log_id, event_timestamp, log_type_id, category, title, raw_json, payload_hash, imported_at, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, bind: [record.sourceLogId, record.eventTimestamp, record.logTypeId, record.category, record.title, record.rawJson, record.payloadHash, now, now, now] }));
    duplicateRecords.forEach((record) => statements.push({ sql: "UPDATE raw_logs SET last_seen_at = ? WHERE source_log_id = ?", bind: [now, record.sourceLogId] }));
    conflictRecords.forEach((record) => statements.push({ sql: `INSERT INTO raw_log_conflicts
      (source_log_id, conflict_type, existing_hash, incoming_hash, incoming_json, detected_at, import_run_id, details)
      VALUES (?, 'payload_changed', ?, ?, ?, ?, ?, 'Original raw payload was retained.')`,
      bind: [record.sourceLogId, existing.get(record.sourceLogId), record.payloadHash, record.rawJson, now, runId] }));
    const cursor = checkpoint ?? {};
    statements.push({ sql: `INSERT INTO sync_checkpoints
      (stream_name, direction, cursor_timestamp, cursor_log_id, boundary_timestamp, status, updated_at, active_import_run_id, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stream_name, direction) DO UPDATE SET cursor_timestamp=excluded.cursor_timestamp,
        cursor_log_id=excluded.cursor_log_id, boundary_timestamp=excluded.boundary_timestamp,
        status=excluded.status, updated_at=excluded.updated_at, active_import_run_id=excluded.active_import_run_id,
        metadata_json=excluded.metadata_json`,
      bind: [STREAM_NAME, direction, cursor.timestamp ?? null, cursor.logId ?? null, cursor.boundaryTimestamp ?? null, cursor.status ?? "running", now, runId, JSON.stringify(cursor.metadata ?? {})] });
    statements.push({ sql: `UPDATE log_import_runs SET pages_fetched = pages_fetched + ?, logs_received = logs_received + ?,
      logs_inserted = logs_inserted + ?, duplicates_detected = duplicates_detected + ?, conflicts_detected = conflicts_detected + ?,
      oldest_timestamp_seen = CASE WHEN oldest_timestamp_seen IS NULL OR ? < oldest_timestamp_seen THEN ? ELSE oldest_timestamp_seen END,
      newest_timestamp_seen = CASE WHEN newest_timestamp_seen IS NULL OR ? > newest_timestamp_seen THEN ? ELSE newest_timestamp_seen END
      WHERE id = ?`, bind: [pageMetrics.pagesFetched ?? 1, pageMetrics.logsReceived ?? records.length, newRecords.length, duplicateRecords.length, conflictRecords.length,
      pageMetrics.oldestTimestamp ?? null, pageMetrics.oldestTimestamp ?? null, pageMetrics.newestTimestamp ?? null, pageMetrics.newestTimestamp ?? null, runId] });
    await this.database.transaction(statements);
    return { inserted: newRecords.length, duplicates: duplicateRecords.length, conflicts: conflictRecords.length };
  }

  async pageChronologically({ from = null, to = null, limit = 100, descending = false } = {}){
    const predicates = []; const bind = [];
    if (from !== null) { predicates.push("event_timestamp >= ?"); bind.push(from); }
    if (to !== null) { predicates.push("event_timestamp <= ?"); bind.push(to); }
    bind.push(Math.max(1, Math.min(Number(limit) || 100, 500)));
    return this.database.query(`SELECT * FROM raw_logs ${predicates.length ? `WHERE ${predicates.join(" AND ")}` : ""}
      ORDER BY event_timestamp ${descending ? "DESC" : "ASC"}, source_log_id ${descending ? "DESC" : "ASC"} LIMIT ?`, bind);
  }

  async pageForReplay({ timestamp = null, sourceLogId = null, limit = 100 } = {}){
    const bind = [];
    let where = "";
    if (timestamp !== null) {
      where = "WHERE COALESCE(event_timestamp, 0) > ? OR (COALESCE(event_timestamp, 0) = ? AND source_log_id > ?)";
      bind.push(timestamp, timestamp, sourceLogId ?? "");
    }
    bind.push(Math.max(1, Math.min(Number(limit) || 100, 500)));
    return this.database.query(`SELECT *, COALESCE(event_timestamp, 0) AS replay_timestamp FROM raw_logs ${where}
      ORDER BY COALESCE(event_timestamp, 0) ASC, source_log_id ASC LIMIT ?`, bind);
  }

  async pageByLogType(logTypeId, { timestamp = null, sourceLogId = null, limit = 500 } = {}){
    const bind = [String(logTypeId)];
    let where = "WHERE log_type_id = ?";
    if (timestamp !== null) {
      where += " AND (COALESCE(event_timestamp, 0) > ? OR (COALESCE(event_timestamp, 0) = ? AND source_log_id > ?))";
      bind.push(timestamp, timestamp, sourceLogId ?? "");
    }
    bind.push(Math.max(1, Math.min(Number(limit) || 500, 500)));
    return this.database.query(`SELECT source_log_id, event_timestamp, raw_json, COALESCE(event_timestamp, 0) AS profile_timestamp FROM raw_logs ${where}
      ORDER BY COALESCE(event_timestamp, 0) ASC, source_log_id ASC LIMIT ?`, bind);
  }

  async countForExport(filters){
    const { where, bind } = exportWhere(filters);
    const [row] = await this.database.query(`SELECT COUNT(*) AS count FROM raw_logs r ${where}`, bind);
    return number(row?.count) ?? 0;
  }

  async pageForExport(filters, { cursor = null, limit = 100 } = {}){
    const { where, bind } = exportWhere(filters, cursor);
    bind.push(Math.max(1, Math.min(Number(limit) || 100, 500)));
    const direction = filters.sortOrder === "newest" ? "DESC" : "ASC";
    return this.database.query(`SELECT r.source_log_id, r.event_timestamp, r.log_type_id, r.category, r.title, r.raw_json,
      r.payload_hash, r.imported_at, r.first_seen_at, r.last_seen_at FROM raw_logs r ${where}
      ORDER BY r.event_timestamp ${direction}, r.source_log_id ${direction} LIMIT ?`, bind);
  }

  async parserCoverageRows(){
    return this.database.query(`SELECT log_type_id, title, event_timestamp, raw_json FROM raw_logs
      ORDER BY log_type_id ASC, title ASC, event_timestamp ASC, source_log_id ASC`);
  }
}

export { STREAM_NAME as RAW_LOG_STREAM_NAME };
