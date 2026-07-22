export const migration007AccountingLedger = {
  version: 7, name: "accounting_ledger_foundation", statements: [
    `CREATE TABLE accounting_ledger_accounts (
      code TEXT PRIMARY KEY, display_name TEXT NOT NULL, category TEXT NOT NULL, normal_balance TEXT NOT NULL,
      monetary INTEGER NOT NULL, quantity_bearing INTEGER NOT NULL, deferred INTEGER NOT NULL, lot_eligible INTEGER NOT NULL, description TEXT NOT NULL
    )`,
    `CREATE TABLE accounting_ledger_transactions (
      id TEXT PRIMARY KEY, ledger_version INTEGER NOT NULL, source_projection_version INTEGER NOT NULL, source_projection_id TEXT NOT NULL,
      source_canonical_event_id TEXT NOT NULL, event_timestamp INTEGER NOT NULL, accounting_classification TEXT NOT NULL, projection_outcome TEXT NOT NULL,
      transaction_status TEXT NOT NULL, balance_status TEXT NOT NULL, debit_total INTEGER NOT NULL, credit_total INTEGER NOT NULL,
      payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, rebuilt_at INTEGER NOT NULL, UNIQUE(source_projection_id, ledger_version)
    )`,
    "CREATE INDEX idx_ledger_transactions_source ON accounting_ledger_transactions(source_projection_id)",
    "CREATE INDEX idx_ledger_transactions_canonical_event ON accounting_ledger_transactions(source_canonical_event_id)",
    "CREATE INDEX idx_ledger_transactions_version ON accounting_ledger_transactions(ledger_version, event_timestamp, id)",
    "CREATE INDEX idx_ledger_transactions_status ON accounting_ledger_transactions(transaction_status)",
    `CREATE TABLE accounting_ledger_lines (
      id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, ledger_version INTEGER NOT NULL, line_sequence INTEGER NOT NULL, account_code TEXT NOT NULL,
      debit_amount INTEGER, credit_amount INTEGER, item_id TEXT, item_uid TEXT, quantity INTEGER, movement_direction TEXT, line_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(transaction_id, line_sequence),
      FOREIGN KEY (transaction_id) REFERENCES accounting_ledger_transactions(id), FOREIGN KEY (account_code) REFERENCES accounting_ledger_accounts(code)
    )`,
    "CREATE INDEX idx_ledger_lines_account ON accounting_ledger_lines(account_code)", "CREATE INDEX idx_ledger_lines_item ON accounting_ledger_lines(item_id, item_uid)",
    `CREATE TABLE accounting_ledger_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ledger_version INTEGER NOT NULL, projection_version INTEGER NOT NULL, status TEXT NOT NULL,
      started_at INTEGER NOT NULL, completed_at INTEGER, metrics_json TEXT NOT NULL, error_summary TEXT
    )`, "CREATE INDEX idx_ledger_runs_version ON accounting_ledger_runs(ledger_version, id DESC)",
  ],
};
