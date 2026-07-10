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
