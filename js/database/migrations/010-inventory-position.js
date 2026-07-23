export const migration010InventoryPosition = {
  version: 10,
  name: "inventory_position_projection",
  statements: [
    `CREATE TABLE accounting_inventory_positions (
      id TEXT PRIMARY KEY, position_version INTEGER NOT NULL, item_id TEXT NOT NULL, item_name TEXT NOT NULL, item_uid TEXT,
      source_cost_lot_version INTEGER NOT NULL, source_fifo_version INTEGER NOT NULL, source_ledger_version INTEGER NOT NULL,
      source_projection_version INTEGER NOT NULL, first_acquisition_timestamp INTEGER NOT NULL, last_acquisition_timestamp INTEGER NOT NULL,
      original_quantity INTEGER NOT NULL, consumed_quantity INTEGER NOT NULL, remaining_quantity INTEGER NOT NULL,
      original_basis INTEGER, consumed_basis INTEGER, remaining_basis INTEGER, known_quantity INTEGER NOT NULL,
      deferred_quantity INTEGER NOT NULL, unknown_quantity INTEGER NOT NULL, known_basis INTEGER NOT NULL, deferred_basis INTEGER,
      fifo_ready_quantity INTEGER NOT NULL, uid_quantity INTEGER NOT NULL, fungible_quantity INTEGER NOT NULL,
      open_lot_count INTEGER NOT NULL, partially_consumed_lot_count INTEGER NOT NULL, fully_consumed_lot_count INTEGER NOT NULL,
      lot_count INTEGER NOT NULL, position_status TEXT NOT NULL, position_health TEXT NOT NULL, position_confidence INTEGER NOT NULL,
      created_timestamp INTEGER NOT NULL, rebuild_run_id INTEGER NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, rebuilt_at INTEGER NOT NULL,
      UNIQUE(position_version, item_id, item_uid)
    )`,
    "CREATE INDEX idx_inventory_positions_version ON accounting_inventory_positions(position_version, id)",
    "CREATE INDEX idx_inventory_positions_item ON accounting_inventory_positions(position_version, item_id)",
    "CREATE INDEX idx_inventory_positions_uid ON accounting_inventory_positions(position_version, item_uid)",
    "CREATE INDEX idx_inventory_positions_remaining_quantity ON accounting_inventory_positions(position_version, remaining_quantity DESC)",
    "CREATE INDEX idx_inventory_positions_remaining_basis ON accounting_inventory_positions(position_version, remaining_basis DESC)",
    "CREATE INDEX idx_inventory_positions_health ON accounting_inventory_positions(position_version, position_health, remaining_quantity DESC)",
    "CREATE INDEX idx_inventory_positions_status ON accounting_inventory_positions(position_version, position_status, remaining_quantity DESC)",
    "CREATE INDEX idx_inventory_positions_confidence ON accounting_inventory_positions(position_version, position_confidence, remaining_quantity DESC)",
    `CREATE TABLE accounting_inventory_position_diagnostics (
      id TEXT PRIMARY KEY, position_version INTEGER NOT NULL, reason_code TEXT NOT NULL, item_id TEXT, item_uid TEXT,
      position_id TEXT, supporting_quantity INTEGER, supporting_basis INTEGER, detail TEXT NOT NULL,
      diagnostic_timestamp INTEGER NOT NULL, rebuild_run_id INTEGER NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL
    )`,
    "CREATE INDEX idx_inventory_position_diagnostics_reason ON accounting_inventory_position_diagnostics(position_version, reason_code, id)",
    "CREATE INDEX idx_inventory_position_diagnostics_position ON accounting_inventory_position_diagnostics(position_id)",
    `CREATE TABLE accounting_inventory_position_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, position_version INTEGER NOT NULL, source_cost_lot_version INTEGER NOT NULL,
      source_fifo_version INTEGER NOT NULL, source_ledger_version INTEGER NOT NULL, source_projection_version INTEGER,
      status TEXT NOT NULL, started_at INTEGER NOT NULL, completed_at INTEGER, metrics_json TEXT NOT NULL, error_summary TEXT
    )`,
    "CREATE INDEX idx_inventory_position_runs_version ON accounting_inventory_position_runs(position_version, id DESC)",
  ],
};
