# Manual verification

- Load the Items page with cached inventory: Quantity is initially sorted descending.
- Select each column header and select it again: the first selection is descending and the second is ascending.
- Change the sort, navigate away and back, then reload: the Items grid retains its selected column and direction.
- Search for an unmatched value: the grid displays its empty state.
- Refresh inventory: the grid displays its loading state, the refresh button is disabled, and rows/statistics update on completion.

## Sprint 2 - Data Model Consolidation

- Load cached inventory created before Sprint 2: Items, quantities, and search results remain available.
- Refresh inventory: the Items page retains the same names, categories, quantities, sorting, and statistics as before.
- Inspect a cached item in local storage: it has `id`, `totalQuantity`, all four locations, and metadata with timestamps/sources.
- Confirm no Torn inventory response fields are read outside `js/services/importers/inventory-importer.js`.

## Sprint 3 - Bazaar Integration & Synchronization

- Refresh items: progress reports inventory, Bazaar, database-building, and completion stages.
- Confirm cached Sprint 2 items load with `{ quantity, updated }` records for every location.
- Refresh with an item in both inventory and Bazaar: its displayed total is the sum of both quantities.
- Refresh with an item only in Bazaar: it remains in the OwnedItem collection after inventory is replaced.
- Confirm Torn inventory and Bazaar response fields are read only in their respective importers.
