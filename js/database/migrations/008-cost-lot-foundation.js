export const migration008CostLotFoundation = {
  version: 8,
  name: "cost_lot_foundation",
  statements: [
    `CREATE TABLE accounting_lot_groups (
      id TEXT PRIMARY KEY, cost_lot_version INTEGER NOT NULL, source_ledger_version INTEGER NOT NULL,
      source_projection_version INTEGER NOT NULL, source_ledger_transaction_id TEXT NOT NULL,
      source_projection_id TEXT NOT NULL, source_canonical_event_id TEXT NOT NULL,
      event_timestamp INTEGER NOT NULL, group_type TEXT NOT NULL, group_status TEXT NOT NULL,
      basis_status TEXT NOT NULL, allocation_status TEXT NOT NULL,
      original_total_basis INTEGER, allocated_total_basis INTEGER, unallocated_total_basis INTEGER,
      lot_count INTEGER NOT NULL, original_total_quantity INTEGER NOT NULL, remaining_total_quantity INTEGER NOT NULL,
      payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, rebuilt_at INTEGER NOT NULL,
      UNIQUE(cost_lot_version, source_ledger_transaction_id)
    )`,
    "CREATE INDEX idx_lot_groups_source_projection ON accounting_lot_groups(source_projection_id)",
    "CREATE INDEX idx_lot_groups_source_canonical ON accounting_lot_groups(source_canonical_event_id)",
    "CREATE INDEX idx_lot_groups_version_time ON accounting_lot_groups(cost_lot_version, event_timestamp, id)",
    "CREATE INDEX idx_lot_groups_status ON accounting_lot_groups(group_status, basis_status, allocation_status)",
    `CREATE TABLE accounting_cost_lots (
      id TEXT PRIMARY KEY, lot_group_id TEXT NOT NULL, cost_lot_version INTEGER NOT NULL,
      source_ledger_version INTEGER NOT NULL, source_ledger_transaction_id TEXT NOT NULL,
      source_ledger_line_id TEXT NOT NULL, source_projection_id TEXT NOT NULL, source_canonical_event_id TEXT NOT NULL,
      item_id TEXT NOT NULL, item_uid TEXT, original_quantity INTEGER NOT NULL, remaining_quantity INTEGER NOT NULL,
      consumed_quantity INTEGER NOT NULL, lot_status TEXT NOT NULL, basis_status TEXT NOT NULL, allocation_status TEXT NOT NULL,
      original_total_basis INTEGER, allocated_basis INTEGER, unallocated_basis INTEGER, unit_basis INTEGER,
      acquisition_timestamp INTEGER NOT NULL, acquisition_sequence TEXT NOT NULL, occurrence_sequence INTEGER NOT NULL,
      payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, rebuilt_at INTEGER NOT NULL,
      UNIQUE(lot_group_id, source_ledger_line_id, occurrence_sequence),
      FOREIGN KEY (lot_group_id) REFERENCES accounting_lot_groups(id)
    )`,
    "CREATE INDEX idx_cost_lots_group ON accounting_cost_lots(lot_group_id)",
    "CREATE INDEX idx_cost_lots_item_sequence ON accounting_cost_lots(item_id, acquisition_sequence)",
    "CREATE INDEX idx_cost_lots_uid ON accounting_cost_lots(item_uid)",
    "CREATE INDEX idx_cost_lots_status ON accounting_cost_lots(lot_status, basis_status, allocation_status)",
    "CREATE INDEX idx_cost_lots_version_time ON accounting_cost_lots(cost_lot_version, acquisition_timestamp, acquisition_sequence)",
    `CREATE TABLE accounting_cost_lot_dispositions (
      id TEXT PRIMARY KEY, cost_lot_version INTEGER NOT NULL, source_ledger_version INTEGER NOT NULL,
      source_ledger_transaction_id TEXT NOT NULL, disposition TEXT NOT NULL, reason_code TEXT NOT NULL,
      payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, rebuilt_at INTEGER NOT NULL,
      UNIQUE(cost_lot_version, source_ledger_transaction_id)
    )`,
    "CREATE INDEX idx_cost_lot_dispositions_status ON accounting_cost_lot_dispositions(cost_lot_version, disposition, reason_code)",
    `CREATE TABLE accounting_cost_lot_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cost_lot_version INTEGER NOT NULL, source_ledger_version INTEGER NOT NULL,
      status TEXT NOT NULL, started_at INTEGER NOT NULL, completed_at INTEGER, metrics_json TEXT NOT NULL, error_summary TEXT
    )`,
    "CREATE INDEX idx_cost_lot_runs_version ON accounting_cost_lot_runs(cost_lot_version, id DESC)",
  ],
};
