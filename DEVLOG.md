# Development Log

## Sprint 2 - Data Model Consolidation

Inventory data now flows through a dedicated importer:

`Torn API page -> InventoryImporter -> ItemStore.merge() -> OwnedItem collection`

`InventoryImporter` is responsible for interpreting Torn inventory response fields and creating `OwnedItem`-compatible records. `ItemStore` owns the local collection, source-aware merging, and persistence. This keeps future Bazaar, Display Case, and Item Market importers independent from the UI and each other.

## Sprint 3 - Bazaar Integration & Synchronization

Synchronization is now coordinated by `ItemSyncService`:

`Torn API -> Importers -> ItemSyncService -> ItemStore.merge() -> OwnedItem collection`

The service runs Inventory and Bazaar imports in sequence, exposes progress updates, and returns a summary. `ItemStore` no longer initiates imports; it only stores and merges normalized items. Locations now retain both a quantity and an update timestamp, allowing Bazaar inventory to contribute automatically to `totalQuantity`.
