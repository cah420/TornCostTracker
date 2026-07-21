/** Reference catalog only. Raw log records and parser output remain immutable. */
export const migration004TornLogTypeCatalog = {
  version: 4,
  name: "torn_log_type_catalog",
  statements: [
    `CREATE TABLE torn_log_types (
      log_type_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      first_catalog_seen INTEGER NOT NULL,
      last_catalog_seen INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      title_hash TEXT NOT NULL,
      source_version TEXT,
      imported_at INTEGER NOT NULL
    )`,
    "CREATE INDEX idx_torn_log_types_active ON torn_log_types(active, log_type_id)",
    `CREATE TABLE torn_log_type_catalog_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_type_id TEXT NOT NULL,
      change_kind TEXT NOT NULL,
      previous_title TEXT,
      current_title TEXT,
      detected_at INTEGER NOT NULL,
      source_version TEXT
    )`,
    "CREATE INDEX idx_torn_log_type_catalog_changes_type ON torn_log_type_catalog_changes(log_type_id, detected_at)",
  ],
};
