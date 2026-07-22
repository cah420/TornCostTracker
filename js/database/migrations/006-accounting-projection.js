/** Rebuildable, derived accounting interpretations; canonical and raw source rows remain immutable. */
export const migration006AccountingProjection = {
  version: 6,
  name: "accounting_projection_foundation",
  statements: [
    `CREATE TABLE accounting_projections (
      id TEXT PRIMARY KEY,
      canonical_event_id TEXT NOT NULL,
      projection_version INTEGER NOT NULL,
      canonical_schema_version INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      accounting_classification TEXT NOT NULL,
      projection_outcome TEXT NOT NULL,
      event_timestamp INTEGER NOT NULL,
      projection_payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rebuilt_at INTEGER NOT NULL,
      UNIQUE(canonical_event_id, projection_version),
      FOREIGN KEY (canonical_event_id) REFERENCES canonical_events(id)
    )`,
    "CREATE INDEX idx_accounting_projections_canonical ON accounting_projections(canonical_event_id)",
    "CREATE INDEX idx_accounting_projections_version ON accounting_projections(projection_version, event_timestamp, id)",
    "CREATE INDEX idx_accounting_projections_outcome ON accounting_projections(projection_outcome, accounting_classification)",
    `CREATE TABLE accounting_projection_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projection_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      metrics_json TEXT NOT NULL,
      error_summary TEXT
    )`,
    "CREATE INDEX idx_accounting_projection_runs_version ON accounting_projection_runs(projection_version, id DESC)",
  ],
};
