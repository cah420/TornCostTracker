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

## Sprint 8 - Current Holdings Cost Basis

CostBasisService is a pure analysis layer: `OwnedItem + canonical Acquisition records -> cost-basis result`. It uses an explicit reverse-chronological strategy, consuming newest acquisition lots first until the item's total quantity is covered. When timestamps are equal, records sort by descending acquisition ID; this stable tiebreaker is documented and tested.

Unresolved acquisitions, including multi-item trades without a safe prior allocation, contribute to matched quantity but never to known cost, weighted average, or price range. The Item Details Purchases tab calculates directly from ItemStore and PurchaseStore whenever it renders, avoiding stale derived persistence.

## Sprint 8.1 - Purchases UX Cleanup & DataGrid Selection

The Purchases page now keeps one DataGrid for its mounted lifetime. Search filters its flattened display rows locally through `setRows()`, so the grid's persisted sort state is retained while the query changes. Item Details keeps cost-basis results concise and directs users to Purchases for full acquisition history.

DataGrid supports optional `rowKey` or `getRowKey` configuration and keeps selection as a stable key, not an object reference. The Items view opts in with canonical `OwnedItem.id`, allowing its selected-row highlight to survive sorting, filtering, and refreshed item copies.

## v0.7.1-alpha1 - In-App README

The Readme view fetches the root `README.md` through the normal view lifecycle and renders it with a small internal Markdown-to-DOM renderer. It does not maintain a second README copy. The renderer supports common documentation blocks and inline formatting, resolves repository-relative paths from the deployed application base URL, and treats raw HTML as plain text instead of injecting it. Readme loading requires Live Server or a hosted site; direct `file://` use is not supported because browsers restrict fetches there.

## v0.7.2-alpha2 - Collapsible Sidebar Navigation

`sidebar-controller` owns one application-shell preference, `tct.ui.sidebarCollapsed`. It restores the preference during application startup, toggles one semantic class on `body`, and updates the hamburger button's accessible state. CSS owns all layout changes: sidebar grid width, main-content expansion, label/branding visibility, and motion. Views and reusable components remain unaware of sidebar state.
