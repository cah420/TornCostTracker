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

## Synchronization enhancements
- Retry policies, scheduling, and persisted refresh summaries in ItemSyncService.

## Future
- Cost-basis allocation for unresolved trades.
- Purchase history, portfolio growth, and historical reporting views.
