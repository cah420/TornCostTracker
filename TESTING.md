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

## Sprint 4 - Item Details & Application Status

- Select an Items-grid row: ItemDetails shows the selected item's general information and location quantities.
- Refresh items: the application StatusBar and synchronization panel update through each import stage.
- Sync while Bazaar is closed: the panel explains the limitation and previously cached Bazaar quantities remain intact.
- Complete a synchronization: the panel displays item counts, merged totals, and elapsed time.

## Sprint 5 - Item Market & Display Case Integration

- Refresh items: Inventory, Bazaar, Display Case, and Item Market each publish progress and a source status.
- Confirm items in Display Case and Item Market contribute to their location quantities and the total quantity.
- Confirm the DataGrid Location column and ItemDetails show every populated location.
- Simulate or encounter a source error: the panel reports Cached and existing quantities remain unchanged.
- Confirm no Display Case or Item Market response fields are read outside their respective importers.

## Sprint 6 - Snapshot Engine

- Complete a synchronization: a new `tct.history.snapshots` entry is saved in local storage.
- Reload the application: the latest snapshot remains available through HistoryStore.
- Confirm each snapshot stores only item IDs, totals, locations, and metadata timestamps.
- Confirm failed synchronizations do not emit a new completion event or create a snapshot.

## Sprint 7 - Purchase Log Ingestion

- Connect an account with a Full Torn API key, open Purchases, and import 1–180 whole days of history.
- Enter decimal, negative, blank, or out-of-range values: setup remains blocked with a validation message.
- Interrupt or fail the first import, then retry: the selected lower boundary and existing records remain intact; setup is not marked complete.
- Complete initial setup, reload, and confirm acquisition rows, summaries, and the player-specific checkpoint persist.
- Sync again: overlapping timestamp pages do not duplicate acquisitions, including entries sharing a timestamp.
- Confirm a multi-item cash trade is displayed as Unresolved and no per-line cost is fabricated; a one-item trade may show its derived cost.
- Change to another connected player: Purchases shows that account's independent initial-setup state. Reset confirms before removing only the current player's records.
- Confirm no raw Torn log payload or API key is present in local storage or console output.
- Open Settings > Clear Purchase Cache: confirm the clear control remains disabled until its acknowledgement checkbox is selected; cancel leaves records intact, while confirmation clears every cached account's purchase records and checkpoints.
- Open Settings > Clear Item Cache: confirm the same acknowledgement flow, then verify the Items grid is empty and its synchronization status resets until the next refresh.
- Import a range containing Torn `Bazaar buy` and `Item market buy` entries: both source types populate acquisitions using their `items`, `cost_total`, and `cost_each` payload fields.
- Import a period with more than one page of logs: the oldest acquisition reaches the selected initial-sync boundary rather than stopping after a partial page.
- If an initial import ends before its boundary, inspect the safe console `pages` trace (record counts, timestamps, and continuation-link state) to identify the endpoint page where Torn stopped returning history.
- Confirm an initial import continues after a short log page without a continuation link, stopping only when the selected lower timestamp boundary is reached.
- Import City Shop and Abroad Shop purchase logs: both display as distinct purchase sources and preserve their item lines and known cash costs.
- Confirm an abroad purchase with a logged country displays as `Abroad - [Country]`; confirm Qty and Item Name are separate sortable DataGrid columns.
- Open Purchases with an empty `tct.itemCatalog`: the catalog downloads once and historical item IDs refresh to Torn item names; reload to confirm the catalog persists locally.
- Confirm an `Item abroad buy` log with `area: 12` displays as `Abroad - Cayman Islands`.
- Confirm the known travel-log area mappings display the correct country: Mexico (2), Hawaii (3), China (6), Switzerland (8), Canada (9), United Kingdom (10), and Cayman Islands (12).
- Confirm Purchases displays separate Cost Each and Total Cost columns; unresolved multi-item trade lines retain Unknown costs.

## Sprint 8 - Current Holdings Cost Basis

- Select an owned item and open Item Details > Purchases: current quantity equals the sum of all four owned-item locations, not a location-specific amount.
- Verify matched lots are consumed newest first. With 10 units at $100 followed by an older 20 at $80 and 15 currently owned, verify 10 and 5 units are used and total known cost is $1,400.
- Verify an unresolved multi-item trade can raise Matched Quantity but never Priced Quantity or Total Known Cost; unresolved costs display as Unknown.
- Verify Quantity Coverage and Priced Coverage are shown separately when history is incomplete or unresolved.
- Verify items with no matching acquisitions show the transparent history/non-purchase movement warning rather than a $0 cost basis.
- Trigger item synchronization, purchase synchronization, purchase-cache clearing, and item-cache clearing: the selected Item Details calculation refreshes or clears accordingly.
- Run `node --experimental-default-type=module js/services/analysis/cost-basis-service.test.mjs` to validate exact lots, weighted averages, partial lots, history shortfalls, unresolved trades, duplicate IDs, grouped acquisitions, City/Abroad sources, stable timestamp ties, and zero holdings.

## Sprint 8.1 - Purchases UX Cleanup & DataGrid Selection

- Open Item Details > Purchases: confirm the tab shows cost-basis summary values, matched dates, explanatory text, and warnings, but no matched-lots DataGrid.
- On Purchases, search by item name, source, counterparty, trade/acquisition ID, and displayed date text. Confirm whitespace and case do not affect results, clearing restores all rows, and no API call occurs.
- Sort Purchases, filter it, and clear the filter: confirm the same sort column and direction remain active.
- Select an Items row: it receives the selected highlight and `aria-selected="true"`. Select another row, sort, filter the first row out and back in, then refresh item rows: selection remains associated with the same item ID when visible.
- Run `node --experimental-default-type=module js/components/data-grid-selection.test.mjs` to validate stable-key selection and local purchase-search matching.
