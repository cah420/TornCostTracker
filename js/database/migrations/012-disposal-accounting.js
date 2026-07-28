export const migration012DisposalAccounting = {
  version: 12,
  name: "disposal_accounting_v1",
  statements: [
    `CREATE TABLE disposal_resolutions (
      id TEXT PRIMARY KEY,
      source_transaction_id TEXT NOT NULL,
      resolution_version INTEGER NOT NULL CHECK(resolution_version > 0),
      schema_version INTEGER NOT NULL CHECK(schema_version > 0),
      resolver_version TEXT NOT NULL,
      accounting_policy_version INTEGER NOT NULL CHECK(accounting_policy_version > 0),
      status TEXT NOT NULL CHECK(status IN ('active', 'superseded', 'needs_review', 'invalid')),
      resolution_method TEXT NOT NULL CHECK(resolution_method IN ('automatic_single_item', 'manual_multi_item')),
      total_gross_proceeds INTEGER NOT NULL CHECK(total_gross_proceeds >= 0),
      total_fees INTEGER NOT NULL CHECK(total_fees >= 0),
      total_net_proceeds INTEGER NOT NULL CHECK(total_net_proceeds >= 0),
      allocations_json TEXT NOT NULL,
      evidence_hash TEXT NOT NULL,
      completion_source_log_id TEXT NOT NULL,
      counterparty_id TEXT,
      transaction_timestamp INTEGER NOT NULL,
      supersedes_resolution_id TEXT,
      is_active INTEGER NOT NULL CHECK(is_active IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      resolved_at INTEGER NOT NULL,
      UNIQUE(source_transaction_id, resolution_version),
      FOREIGN KEY(completion_source_log_id) REFERENCES raw_logs(source_log_id),
      FOREIGN KEY(supersedes_resolution_id) REFERENCES disposal_resolutions(id)
    )`,
    "CREATE UNIQUE INDEX idx_disposal_resolutions_one_active ON disposal_resolutions(source_transaction_id) WHERE is_active = 1",
    "CREATE INDEX idx_disposal_resolutions_status ON disposal_resolutions(status, transaction_timestamp DESC, source_transaction_id)",
    "CREATE INDEX idx_disposal_resolutions_history ON disposal_resolutions(source_transaction_id, resolution_version DESC)",
    `CREATE TABLE disposal_resolution_event_links (
      resolution_id TEXT NOT NULL,
      canonical_event_id TEXT NOT NULL UNIQUE,
      allocation_index INTEGER NOT NULL,
      lot_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(resolution_id, canonical_event_id),
      FOREIGN KEY(resolution_id) REFERENCES disposal_resolutions(id),
      FOREIGN KEY(canonical_event_id) REFERENCES canonical_events(id)
    )`,
    "CREATE INDEX idx_disposal_resolution_event_links_resolution ON disposal_resolution_event_links(resolution_id, allocation_index, lot_index)",
    `CREATE TABLE accounting_realized_results (
      id TEXT PRIMARY KEY,
      fifo_version INTEGER NOT NULL,
      source_consumption_id TEXT NOT NULL,
      source_disposal_canonical_event_id TEXT NOT NULL,
      source_lot_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_uid TEXT,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      disposal_type TEXT NOT NULL,
      allocated_net_proceeds INTEGER,
      consumed_basis INTEGER,
      realized_result INTEGER,
      result_status TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rebuilt_at INTEGER NOT NULL,
      UNIQUE(fifo_version, source_consumption_id),
      FOREIGN KEY(source_consumption_id) REFERENCES accounting_fifo_consumptions(id),
      FOREIGN KEY(source_lot_id) REFERENCES accounting_cost_lots(id)
    )`,
    "CREATE INDEX idx_realized_results_item ON accounting_realized_results(fifo_version, item_id, occurred_at)",
    "CREATE INDEX idx_realized_results_status ON accounting_realized_results(fifo_version, result_status)",
    `INSERT INTO accounting_rebuild_state (layer, stale_since, reason, source_entity_id)
      VALUES ('accounting_projection', CAST(strftime('%s','now') AS INTEGER) * 1000, 'disposal_accounting_v1', 'migration:12')
      ON CONFLICT(layer) DO UPDATE SET stale_since=excluded.stale_since, reason=excluded.reason, source_entity_id=excluded.source_entity_id`,
    `INSERT INTO accounting_rebuild_state (layer, stale_since, reason, source_entity_id)
      VALUES ('accounting_ledger', CAST(strftime('%s','now') AS INTEGER) * 1000, 'disposal_accounting_v1', 'migration:12')
      ON CONFLICT(layer) DO UPDATE SET stale_since=excluded.stale_since, reason=excluded.reason, source_entity_id=excluded.source_entity_id`,
    `INSERT INTO accounting_rebuild_state (layer, stale_since, reason, source_entity_id)
      VALUES ('cost_lots', CAST(strftime('%s','now') AS INTEGER) * 1000, 'disposal_accounting_v1', 'migration:12')
      ON CONFLICT(layer) DO UPDATE SET stale_since=excluded.stale_since, reason=excluded.reason, source_entity_id=excluded.source_entity_id`,
    `INSERT INTO accounting_rebuild_state (layer, stale_since, reason, source_entity_id)
      VALUES ('fifo', CAST(strftime('%s','now') AS INTEGER) * 1000, 'disposal_accounting_v1', 'migration:12')
      ON CONFLICT(layer) DO UPDATE SET stale_since=excluded.stale_since, reason=excluded.reason, source_entity_id=excluded.source_entity_id`,
    `INSERT INTO accounting_rebuild_state (layer, stale_since, reason, source_entity_id)
      VALUES ('inventory_position', CAST(strftime('%s','now') AS INTEGER) * 1000, 'disposal_accounting_v1', 'migration:12')
      ON CONFLICT(layer) DO UPDATE SET stale_since=excluded.stale_since, reason=excluded.reason, source_entity_id=excluded.source_entity_id`,
  ],
};
