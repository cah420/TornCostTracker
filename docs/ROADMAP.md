# Roadmap

## Completed foundations
- Modular application shell, router, API queue, and local storage.
- Item inventory cache and reusable DataGrid.
- OwnedItem collection and importers for Inventory, Bazaar, Display Case, and Item Market.
- Desktop ItemDetails, status bar, and synchronization status/summary panels.
- Historical SnapshotService and HistoryStore foundations.
- Purchase-log ingestion with canonical acquisitions, account-scoped persistence, and incremental checkpoints.
- Global Torn item catalog for reference-data lookups across owned and historical items.

## Synchronization enhancements
- Retry policies, scheduling, and persisted refresh summaries in ItemSyncService.

## Future
- Cost-basis allocation for unresolved trades and purchase-line analysis.
- Purchase history, portfolio growth, and historical reporting views.
