import { Database } from "./database-client.js";

function asNumber(value){ const number = Number(value); return Number.isFinite(number) ? number : null; }

/** SQLite reference-data repository. It does not interpret, mutate, or replay raw logs. */
export class LogTypeCatalogRepository {
  constructor(database = Database){ this.database = database; }

  async list(){
    const rows = await this.database.query(`SELECT log_type_id, title, first_catalog_seen, last_catalog_seen,
      active, title_hash, source_version, imported_at FROM torn_log_types ORDER BY CAST(log_type_id AS INTEGER), log_type_id`);
    return rows.map((row) => ({ ...row, active: Boolean(asNumber(row.active)) }));
  }

  async listChanges(){
    return this.database.query(`SELECT log_type_id, change_kind, previous_title, current_title, detected_at, source_version
      FROM torn_log_type_catalog_changes ORDER BY detected_at DESC, id DESC`);
  }

  async refresh(records, { importedAt = Date.now(), sourceVersion = null } = {}){
    const existingRows = await this.list();
    const existing = new Map(existingRows.map((row) => [String(row.log_type_id), row]));
    const incoming = new Map(records.map((record) => [String(record.logTypeId), record]));
    const statements = []; const summary = { newIds: 0, renamedIds: 0, removedIds: 0, unchanged: 0, catalogTotal: incoming.size };

    incoming.forEach((record, logTypeId) => {
      const previous = existing.get(logTypeId);
      if (!previous) {
        summary.newIds += 1;
        statements.push({ sql: `INSERT INTO torn_log_types
          (log_type_id, title, first_catalog_seen, last_catalog_seen, active, title_hash, source_version, imported_at)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)`, bind: [logTypeId, record.title, importedAt, importedAt, record.titleHash, sourceVersion, importedAt] });
        statements.push({ sql: `INSERT INTO torn_log_type_catalog_changes
          (log_type_id, change_kind, previous_title, current_title, detected_at, source_version)
          VALUES (?, 'new', NULL, ?, ?, ?)`, bind: [logTypeId, record.title, importedAt, sourceVersion] });
      } else if (previous.title_hash !== record.titleHash) {
        summary.renamedIds += 1;
        statements.push({ sql: `UPDATE torn_log_types SET title = ?, last_catalog_seen = ?, active = 1,
          title_hash = ?, source_version = ?, imported_at = ? WHERE log_type_id = ?`, bind: [record.title, importedAt, record.titleHash, sourceVersion, importedAt, logTypeId] });
        statements.push({ sql: `INSERT INTO torn_log_type_catalog_changes
          (log_type_id, change_kind, previous_title, current_title, detected_at, source_version)
          VALUES (?, 'renamed', ?, ?, ?, ?)`, bind: [logTypeId, previous.title, record.title, importedAt, sourceVersion] });
      } else {
        summary.unchanged += 1;
        statements.push({ sql: "UPDATE torn_log_types SET last_catalog_seen = ?, active = 1, source_version = ?, imported_at = ? WHERE log_type_id = ?", bind: [importedAt, sourceVersion, importedAt, logTypeId] });
      }
    });

    existing.forEach((previous, logTypeId) => {
      if (!incoming.has(logTypeId) && previous.active) {
        summary.removedIds += 1;
        statements.push({ sql: "UPDATE torn_log_types SET active = 0, imported_at = ? WHERE log_type_id = ?", bind: [importedAt, logTypeId] });
        statements.push({ sql: `INSERT INTO torn_log_type_catalog_changes
          (log_type_id, change_kind, previous_title, current_title, detected_at, source_version)
          VALUES (?, 'removed', ?, NULL, ?, ?)`, bind: [logTypeId, previous.title, importedAt, sourceVersion] });
      }
    });
    if (statements.length) await this.database.transaction(statements);
    return summary;
  }
}
