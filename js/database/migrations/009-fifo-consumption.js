export const migration009FifoConsumption = {
  version: 9,
  name: "fifo_consumption_engine",
  statements: [
    `CREATE TABLE accounting_fifo_disposal_demands (
      id TEXT PRIMARY KEY, fifo_version INTEGER NOT NULL, source_cost_lot_version INTEGER NOT NULL, source_ledger_version INTEGER NOT NULL,
      source_ledger_transaction_id TEXT NOT NULL, source_ledger_line_id TEXT NOT NULL, source_projection_id TEXT NOT NULL,
      source_canonical_event_id TEXT NOT NULL, item_id TEXT NOT NULL, item_uid TEXT,
      original_demand_quantity INTEGER NOT NULL, matched_quantity INTEGER NOT NULL, unmatched_quantity INTEGER NOT NULL,
      disposal_timestamp INTEGER NOT NULL, disposal_sequence TEXT NOT NULL, demand_status TEXT NOT NULL,
      proceeds_total INTEGER, proceeds_allocation_status TEXT NOT NULL, reason_code TEXT,
      payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, rebuilt_at INTEGER NOT NULL,
      UNIQUE(fifo_version, source_ledger_transaction_id, source_ledger_line_id)
    )`,
    "CREATE INDEX idx_fifo_demands_source ON accounting_fifo_disposal_demands(fifo_version, source_ledger_transaction_id)",
    "CREATE INDEX idx_fifo_demands_item_order ON accounting_fifo_disposal_demands(fifo_version, item_id, disposal_sequence)",
    "CREATE INDEX idx_fifo_demands_uid ON accounting_fifo_disposal_demands(item_uid)",
    "CREATE INDEX idx_fifo_demands_status ON accounting_fifo_disposal_demands(demand_status, unmatched_quantity)",
    `CREATE TABLE accounting_fifo_consumptions (
      id TEXT PRIMARY KEY, fifo_version INTEGER NOT NULL, source_cost_lot_version INTEGER NOT NULL, source_ledger_version INTEGER NOT NULL,
      disposal_demand_id TEXT NOT NULL, source_disposal_ledger_transaction_id TEXT NOT NULL, source_disposal_ledger_line_id TEXT NOT NULL,
      source_disposal_projection_id TEXT NOT NULL, source_disposal_canonical_event_id TEXT NOT NULL,
      source_lot_id TEXT NOT NULL, source_lot_group_id TEXT NOT NULL, item_id TEXT NOT NULL, item_uid TEXT,
      consumed_quantity INTEGER NOT NULL, disposal_timestamp INTEGER NOT NULL, disposal_sequence TEXT NOT NULL,
      lot_acquisition_timestamp INTEGER NOT NULL, lot_acquisition_sequence TEXT NOT NULL,
      match_sequence_within_disposal INTEGER NOT NULL, match_sequence_within_lot INTEGER NOT NULL,
      policy_code TEXT NOT NULL, match_type TEXT NOT NULL, basis_status TEXT NOT NULL,
      consumed_allocated_basis INTEGER, consumed_unit_basis INTEGER, source_disposal_proceeds INTEGER,
      payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, rebuilt_at INTEGER NOT NULL,
      UNIQUE(fifo_version, disposal_demand_id, source_lot_id, match_sequence_within_disposal),
      FOREIGN KEY (disposal_demand_id) REFERENCES accounting_fifo_disposal_demands(id),
      FOREIGN KEY (source_lot_id) REFERENCES accounting_cost_lots(id)
    )`,
    "CREATE INDEX idx_fifo_consumptions_demand ON accounting_fifo_consumptions(disposal_demand_id, match_sequence_within_disposal)",
    "CREATE INDEX idx_fifo_consumptions_lot ON accounting_fifo_consumptions(source_lot_id, match_sequence_within_lot)",
    "CREATE INDEX idx_fifo_consumptions_lot_group ON accounting_fifo_consumptions(source_lot_group_id)",
    "CREATE INDEX idx_fifo_consumptions_disposal_source ON accounting_fifo_consumptions(source_disposal_ledger_transaction_id)",
    "CREATE INDEX idx_fifo_consumptions_item_order ON accounting_fifo_consumptions(fifo_version, item_id, disposal_sequence)",
    "CREATE INDEX idx_fifo_consumptions_uid ON accounting_fifo_consumptions(item_uid)",
    `CREATE TABLE accounting_fifo_dispositions (
      id TEXT PRIMARY KEY, fifo_version INTEGER NOT NULL, source_cost_lot_version INTEGER NOT NULL, source_ledger_version INTEGER NOT NULL,
      source_ledger_transaction_id TEXT NOT NULL, disposition TEXT NOT NULL, reason_code TEXT NOT NULL,
      payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, rebuilt_at INTEGER NOT NULL,
      UNIQUE(fifo_version, source_ledger_transaction_id)
    )`,
    "CREATE INDEX idx_fifo_dispositions_status ON accounting_fifo_dispositions(fifo_version, disposition, reason_code)",
    `CREATE TABLE accounting_fifo_diagnostics (
      id TEXT PRIMARY KEY, fifo_version INTEGER NOT NULL, diagnostic_type TEXT NOT NULL, reason_code TEXT NOT NULL,
      source_ledger_transaction_id TEXT, disposal_demand_id TEXT, source_lot_id TEXT, item_id TEXT, item_uid TEXT,
      quantity_context INTEGER, detail TEXT, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL
    )`,
    "CREATE INDEX idx_fifo_diagnostics_reason ON accounting_fifo_diagnostics(fifo_version, diagnostic_type, reason_code)",
    `CREATE TABLE accounting_fifo_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fifo_version INTEGER NOT NULL, source_cost_lot_version INTEGER NOT NULL,
      source_ledger_version INTEGER NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL,
      completed_at INTEGER, metrics_json TEXT NOT NULL, error_summary TEXT
    )`,
    "CREATE INDEX idx_fifo_runs_version ON accounting_fifo_runs(fifo_version, id DESC)",
  ],
};
