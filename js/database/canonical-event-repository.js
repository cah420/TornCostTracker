import { Database } from "./database-client.js";
import { stableStringify } from "../services/raw-log-serialization.js";

function number(value){ const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

/** SQLite repository for derived canonical events and parser processing state. */
export class CanonicalEventRepository {
  constructor(database = Database){ this.database = database; }

  async storeResult({ sourceLogId, parserName, parserVersion, status, events = [], errorMessage = null }){
    const existing = events.length ? await this.database.query(`SELECT id FROM canonical_events WHERE id IN (${events.map(() => "?").join(",")})`, events.map((event) => event.id)) : [];
    const existingIds = new Set(existing.map((row) => row.id));
    const now = Date.now();
    const statements = events.map((event) => ({ sql: `INSERT INTO canonical_events
      (id, source_log_id, event_timestamp, parser_name, parser_version, schema_version, event_type, canonical_payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      bind: [event.id, event.sourceLogId, event.eventTimestamp, event.parserName, event.parserVersion, event.schemaVersion, event.eventType, stableStringify(event), now] }));
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
}
