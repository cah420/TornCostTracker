export const migration003CanonicalEvents = {
  version: 3,
  name: "canonical_event_framework",
  statements: [
    `CREATE TABLE canonical_events (
      id TEXT PRIMARY KEY,
      source_log_id TEXT NOT NULL,
      event_timestamp INTEGER NOT NULL,
      parser_name TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      canonical_payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(source_log_id, parser_name, parser_version, id),
      FOREIGN KEY (source_log_id) REFERENCES raw_logs(source_log_id)
    )`,
    "CREATE INDEX idx_canonical_events_source ON canonical_events(source_log_id)",
    "CREATE INDEX idx_canonical_events_timestamp ON canonical_events(event_timestamp, id)",
    "CREATE INDEX idx_canonical_events_parser ON canonical_events(parser_name, parser_version)",
    `CREATE TABLE processing_state (
      source_log_id TEXT NOT NULL,
      parser_name TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      status TEXT NOT NULL,
      processed_at INTEGER NOT NULL,
      error_message TEXT,
      PRIMARY KEY(source_log_id, parser_name, parser_version),
      FOREIGN KEY (source_log_id) REFERENCES raw_logs(source_log_id)
    )`,
    "CREATE INDEX idx_processing_state_status ON processing_state(status, processed_at)",
  ],
};
