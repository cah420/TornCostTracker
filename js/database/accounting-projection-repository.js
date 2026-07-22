import { Database } from "./database-client.js";
import { stableStringify } from "../services/raw-log-serialization.js";

function number(value){ const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

/** Persistence boundary for rebuildable accounting interpretations only. */
export class AccountingProjectionRepository {
  constructor(database = Database){ this.database = database; }
  async startRun({ projectionVersion, startedAt = Date.now() }){
    await this.database.transaction([{ sql: "INSERT INTO accounting_projection_runs (projection_version, status, started_at, metrics_json) VALUES (?, 'running', ?, ?)", bind: [projectionVersion, startedAt, "{}"] }]);
    const rows = await this.database.query("SELECT * FROM accounting_projection_runs ORDER BY id DESC LIMIT 1"); return rows[0];
  }
  async finishRun(id, { status, metrics, errorSummary = null, completedAt = Date.now() }){
    await this.database.transaction([{ sql: "UPDATE accounting_projection_runs SET status = ?, completed_at = ?, metrics_json = ?, error_summary = ? WHERE id = ?", bind: [status, completedAt, stableStringify(metrics), errorSummary, id] }]);
  }
  async storeBatch(records, { projectionVersion, now = Date.now() } = {}){
    if (!records.length) return { inserted: 0, existing: 0 };
    const ids = records.map((record) => record.id);
    const existingRows = await this.database.query(`SELECT id FROM accounting_projections WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    const existing = new Set(existingRows.map((row) => row.id));
    const statements = records.map((record) => ({ sql: `INSERT INTO accounting_projections
      (id, canonical_event_id, projection_version, canonical_schema_version, event_type, accounting_classification, projection_outcome, event_timestamp, projection_payload_json, created_at, rebuilt_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET projection_payload_json=excluded.projection_payload_json, rebuilt_at=excluded.rebuilt_at`,
      bind: [record.id, record.canonicalEventId, projectionVersion, record.canonicalEventVersion, record.canonicalEventType, record.classification, record.outcome, record.eventTimestamp, stableStringify(record), now, now] }));
    await this.database.transaction(statements);
    return { inserted: records.filter((record) => !existing.has(record.id)).length, existing: records.filter((record) => existing.has(record.id)).length };
  }
  async latestRun(projectionVersion){ const rows = await this.database.query("SELECT * FROM accounting_projection_runs WHERE projection_version = ? ORDER BY id DESC LIMIT 1", [projectionVersion]); return rows[0] ? { ...rows[0], metrics: JSON.parse(rows[0].metrics_json) } : null; }
  async countRows(projectionVersion){ const [row] = await this.database.query("SELECT COUNT(*) AS count FROM accounting_projections WHERE projection_version = ?", [projectionVersion]); return number(row?.count); }
  async clearVersion(projectionVersion){ await this.database.transaction([{ sql: "DELETE FROM accounting_projections WHERE projection_version = ?", bind: [projectionVersion] }]); }
  async listDiagnostics(projectionVersion, outcome, { limit = 25 } = {}){
    const rows = await this.database.query("SELECT projection_payload_json FROM accounting_projections WHERE projection_version = ? AND projection_outcome = ? ORDER BY event_timestamp DESC, id DESC LIMIT ?", [projectionVersion, outcome, Math.max(1, Math.min(Number(limit) || 25, 100))]);
    return rows.map((row) => JSON.parse(row.projection_payload_json));
  }
  async pageForLedger(projectionVersion, { timestamp = null, id = null, limit = 250 } = {}){
    const bind = [projectionVersion]; let where = "WHERE projection_version = ?";
    if (timestamp !== null) { where += " AND (event_timestamp > ? OR (event_timestamp = ? AND id > ?))"; bind.push(timestamp, timestamp, id ?? ""); }
    bind.push(Math.max(1, Math.min(Number(limit) || 250, 500)));
    return this.database.query(`SELECT id, event_timestamp, projection_payload_json FROM accounting_projections ${where} ORDER BY event_timestamp ASC, id ASC LIMIT ?`, bind);
  }
}
