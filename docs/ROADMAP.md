# Roadmap

## Completed foundations
- Modular application shell, router, API queue, and local storage.
- Item inventory cache and reusable DataGrid.
- OwnedItem collection and importers for Inventory, Bazaar, Display Case, and Item Market.
- Desktop ItemDetails, status bar, and synchronization status/summary panels.
- Historical SnapshotService and HistoryStore foundations.
- Purchase-log ingestion with canonical acquisitions, account-scoped persistence, and incremental checkpoints.
- Global Torn item catalog for reference-data lookups across owned and historical items.
- Current-holdings cost-basis estimates with reverse-chronological lot matching and transparent coverage reporting.
- Local purchase-history search and stable selected-row behavior in DataGrid.
- In-app tester documentation sourced from the root README.
- Persisted, accessible collapsible desktop sidebar navigation.
- Known cash cost-basis classifications for paid, zero-cost, non-cash, and unresolved acquisition lots.
- Base-item aggregation for uniquely-instanced equipment across all owned locations.
- FIFO cost-lot ledger, verified inventory conversion history, and current-item market valuation.

## Synchronization enhancements
- Shared ordered Torn API scheduling at a conservative 1,200 ms start interval, with bounded rate-limit backoff and persisted refresh summaries in ItemSyncService.
- SQLite migration foundation: official WASM/OPFS worker, schema migrations, repository contracts, diagnostics, and LocalStorage-compatible staged cutover.
- SQLite raw-log warehouse: immutable raw Torn evidence, resumable historical/incremental archive imports, conflict diagnostics, and parser/replay contracts while LocalStorage accounting remains active.

## Future
- Cost-basis allocation for unresolved trades.
- Per-instance equipment details such as UID, weapon/armor stats, bonuses, and equipped state.
- Purchase history, portfolio growth, and historical reporting views.
