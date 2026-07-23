import { Database } from "./database-client.js";
import { stableStringify } from "../services/raw-log-serialization.js";

function number(value){ const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

/** SQLite repository for derived canonical events and parser processing state. */
export class CanonicalEventRepository {
  constructor(database = Database){ this.database = database; }

  async storeResult({ sourceLogId, parserName, parserVersion, supersedesParserNames = [], status, events = [], errorMessage = null }){
    const existing = events.length ? await this.database.query(`SELECT id FROM canonical_events WHERE id IN (${events.map(() => "?").join(",")})`, events.map((event) => event.id)) : [];
    const existingIds = new Set(existing.map((row) => row.id));
    const now = Date.now();
    const parserNames = [...new Set([parserName, ...supersedesParserNames].map(String).filter(Boolean))];
    const parserPlaceholders = parserNames.map(() => "?").join(",");
    const retainedIds = events.map((event) => event.id);
    const deleteEventsSql = `DELETE FROM canonical_events WHERE source_log_id = ? AND parser_name IN (${parserPlaceholders})${retainedIds.length ? ` AND id NOT IN (${retainedIds.map(() => "?").join(",")})` : ""}`;
    const supersededEventWhere = `source_log_id = ? AND parser_name IN (${parserPlaceholders})${retainedIds.length ? ` AND id NOT IN (${retainedIds.map(() => "?").join(",")})` : ""}`;
    const replacementBind = [sourceLogId, ...parserNames, ...retainedIds];
    const statements = [
      { sql: `DELETE FROM accounting_projections WHERE canonical_event_id IN (SELECT id FROM canonical_events WHERE ${supersededEventWhere})`, bind: replacementBind },
      { sql: deleteEventsSql, bind: replacementBind },
      { sql: `DELETE FROM processing_state WHERE source_log_id = ? AND parser_name IN (${parserPlaceholders}) AND NOT (parser_name = ? AND parser_version = ?)`, bind: [sourceLogId, ...parserNames, parserName, parserVersion] },
      ...events.map((event) => ({ sql: `INSERT INTO canonical_events
      (id, source_log_id, event_timestamp, parser_name, parser_version, schema_version, event_type, canonical_payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      bind: [event.id, event.sourceLogId, event.eventTimestamp, event.parserName, event.parserVersion, event.schemaVersion, event.eventType, stableStringify(event), now] })),
    ];
    statements.push({ sql: `INSERT INTO processing_state (source_log_id, parser_name, parser_version, status, processed_at, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_log_id, parser_name, parser_version) DO UPDATE SET status=excluded.status, processed_at=excluded.processed_at, error_message=excluded.error_message`,
      bind: [sourceLogId, parserName, parserVersion, status, now, errorMessage] });
    await this.database.transaction(statements);
    return { inserted: events.filter((event) => !existingIds.has(event.id)).length, duplicates: events.filter((event) => existingIds.has(event.id)).length };
  }

  async summary(){
    const [events] = await this.database.query("SELECT COUNT(*) AS canonicalEvents FROM canonical_events");
    const states = await this.database.query("SELECT status, COUNT(*) AS count FROM processing_state GROUP BY status");
    const byStatus = Object.fromEntries(states.map((row) => [row.status, number(row.count)]));
    return { canonicalEvents: number(events?.canonicalEvents), processed: byStatus.processed ?? 0, unsupported: byStatus.unsupported ?? 0, ignored: byStatus.ignored ?? 0, errors: byStatus.error ?? 0 };
  }

  async listParserVersions(){
    return this.database.query("SELECT parser_name, parser_version, COUNT(*) AS event_count FROM canonical_events GROUP BY parser_name, parser_version ORDER BY parser_name, parser_version");
  }
  async eventTypeCounts(){
    return this.database.query("SELECT event_type, COUNT(*) AS count FROM canonical_events GROUP BY event_type ORDER BY event_type");
  }
  async eventCountsByLogType(){
    return this.database.query(`SELECT r.log_type_id, COUNT(e.id) AS canonical_events
      FROM raw_logs r LEFT JOIN canonical_events e ON e.source_log_id = r.source_log_id
      GROUP BY r.log_type_id`);
  }
  async pageForProjection({ timestamp = null, id = null, limit = 250 } = {}){
    const bind = []; let where = "";
    if (timestamp !== null) { where = "WHERE (event_timestamp > ? OR (event_timestamp = ? AND id > ?))"; bind.push(timestamp, timestamp, id ?? ""); }
    bind.push(Math.max(1, Math.min(Number(limit) || 250, 500)));
    return this.database.query(`SELECT id, event_timestamp, schema_version, event_type, canonical_payload_json FROM canonical_events ${where}
      ORDER BY event_timestamp ASC, id ASC LIMIT ?`, bind);
  }
}
