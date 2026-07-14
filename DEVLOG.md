# Development Log

## Sprint 2 - Data Model Consolidation

Inventory data now flows through a dedicated importer:

`Torn API page -> InventoryImporter -> ItemStore.merge() -> OwnedItem collection`

`InventoryImporter` is responsible for interpreting Torn inventory response fields and creating `OwnedItem`-compatible records. `ItemStore` owns the local collection, source-aware merging, and persistence. This keeps future Bazaar, Display Case, and Item Market importers independent from the UI and each other.

## Sprint 3 - Bazaar Integration & Synchronization

Synchronization is now coordinated by `ItemSyncService`:

`Torn API -> Importers -> ItemSyncService -> ItemStore.merge() -> OwnedItem collection`

The service runs Inventory and Bazaar imports in sequence, exposes progress updates, and returns a summary. `ItemStore` no longer initiates imports; it only stores and merges normalized items. Locations now retain both a quantity and an update timestamp, allowing Bazaar inventory to contribute automatically to `totalQuantity`.

## Sprint 4 - Item Details & Application Status

The desktop layer now uses the existing event bus for `itemSelected`, `statusChanged`, `itemsSynced`, and `connectionChanged` events. DataGrid emits selection events without knowing about stores; ItemDetails renders the selected OwnedItem. StatusBar and SyncStatusPanel consume synchronization events from ItemSyncService, keeping progress and summaries outside importer and store responsibilities.

## Sprint 5 - Item Market & Display Case Integration

DisplayCaseImporter and ItemMarketImporter now normalize their sources into OwnedItem records. ItemSyncService runs all four sources sequentially and treats source-specific API failures as cached states, retaining the previously stored quantity rather than replacing it with zero.

## Sprint 6 - Snapshot Engine

SnapshotService listens for the `itemsSynced` completion event and captures a compact historical representation of the current OwnedItem collection. HistoryStore persists snapshots independently from ItemStore and exposes latest, list, and timestamp lookup APIs. Retention configuration currently defaults to unlimited, while supporting future age and count pruning.

## Sprint 7 - Purchase Log Ingestion

Purchase history now follows a parallel, independent flow:

`Torn user logs -> PurchaseLogImporter -> PurchaseSyncService -> PurchaseStore -> Purchases view`

`PurchaseLogImporter` is the only module that reads Torn log titles, response fields, and `parsed_trade_id`. It emits compact canonical `Acquisition` records rather than raw log payloads. Multi-item trades retain their one total cash amount with an `unresolved` allocation status; only a single-item trade receives a derived unit cost. Purchase records and sync checkpoints are partitioned by connected player ID, so changing accounts never exposes another player's locally stored history.

City Shop and Abroad Shop purchases are normalized as separate acquisition sources. Their Torn-specific title recognition remains inside PurchaseLogImporter, allowing future cost-basis analysis to distinguish each purchasing channel without changing PurchaseStore or the Purchases view.

Acquisitions can now retain a neutral source-location label for Abroad purchases. The Purchases DataGrid presents one row per item line so Quantity and Item Name can be sorted independently without inventing an allocation for unresolved multi-item trades.

The global Item Catalog is independent from ItemStore. ItemCatalogService downloads Torn's item reference data through the shared queue and ItemCatalogStore persists only ID, name, and category. Purchases use this catalog before falling back to currently owned item names, allowing historical purchases to retain readable names after an item is sold or consumed.
