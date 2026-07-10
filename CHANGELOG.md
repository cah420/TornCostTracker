# v0.5.2
Item Store added.

## v0.5.3.1
- Improved sortable table UX.

## Sprint 1 - DataGrid Core
- Replaced the Items table helper with a reusable DataGrid component.
- Added descending-first sorting, persisted sort preferences, loading and empty states, numeric alignment, and optional row callbacks.

## Sprint 2 - Data Model Consolidation
- Added the canonical OwnedItem model with location and source metadata.
- Added InventoryImporter to normalize Torn inventory responses before they reach ItemStore.
- Migrated ItemStore to merge OwnedItem records rather than retain raw inventory rows.

## Sprint 3 - Bazaar Integration & Synchronization
- Added BazaarImporter and Bazaar location quantities with update timestamps.
- Added ItemSyncService to coordinate imports, progress reporting, and refresh summaries.
- Restricted ItemStore to OwnedItem merging, storage, searching, statistics, and persistence.

## Sprint 4 - Item Details & Application Status
- Added reusable ItemDetails, StatusBar, and synchronization status components.
- Added DataGrid item selection, synchronization status events, and refresh summaries.

## Sprint 5 - Item Market & Display Case Integration
- Added DisplayCaseImporter and ItemMarketImporter as OwnedItem location sources.
- Extended ItemSyncService to synchronize all four owned-item locations and preserve cached data on source errors.
