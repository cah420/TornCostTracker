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
- Canonical event framework: versioned parser registry, generic movement envelope, deterministic replay, processing diagnostics, and initial Wallet/Blood Bag parsers without accounting migration.
- Temporary developer raw-log JSONL export: read-only filtered/sampled local downloads with redaction and a confirmed full-raw mode; formal backup/restore remains future work.
- Core inventory canonical coverage: verified observed purchase/reward/find and conservative trade-offer parsers, fixture library, payload signatures, and imported-data coverage diagnostics.
- Torn Log Type Catalog & Coverage Intelligence: persisted official ID/title reference data, non-destructive catalog diffs, manual relevance metadata, and a catalog/observed/parser coverage roadmap.

## Future
- Cost-basis allocation for unresolved trades.
- Per-instance equipment details such as UID, weapon/armor stats, bonuses, and equipped state.
- Purchase history, portfolio growth, and historical reporting views.
- Expand parser coverage only from verified raw-log samples, prioritizing observed accounting-relevant unsupported and partially supported log types.
