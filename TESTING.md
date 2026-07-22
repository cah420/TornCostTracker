# Manual verification

## Accounting Ledger Foundation (Sprint 11.1)

- Run `node js/services/history/accounting-ledger.test.mjs` for controlled account catalog, deterministic IDs/order, paid posting balance, deferred multi-item allocation, non-cash reward, neutral transfer, unresolved trade, UID preservation, and malformed-money ledger-error coverage.
- Run `node js/services/history/accounting-ledger-service.test.mjs` for paged rebuild, reconciliation, and a repeat rebuild that inserts no duplicate transactions or lines.
- In a secure OPFS-capable browser with archived projections, use **Settings -> Accounting Ledger -> Rebuild Accounting Ledger** twice. Confirm the second run reports zero new records, every source projection has one ledger disposition, all posted entries balance, global debits equal credits, trades remain unresolved, and no active Purchases/inventory/FIFO values change.

## SQLite migration foundation

- Run `node --experimental-default-type=module js/database/migration-runner.test.mjs`: verify numbered migrations apply once in ascending order and are repeatable.
- In a secure, OPFS-capable browser, initialize the database infrastructure manually during development and confirm diagnostics report the `opfs-sahpool` VFS, SQLite version, and schema version. Existing Items, Purchases, conversion, and settings flows must still use LocalStorage unchanged.
- In an OPFS-unavailable browser/private context, confirm diagnostics report LocalStorage compatibility mode and the existing application remains functional.

## SQLite raw-log warehouse (Sprint 10.2)

- Run `node --experimental-default-type=module js/services/raw-log-import-service.test.mjs` for deterministic continuation and timestamp-fallback pagination, unknown-log retention, duplicate, conflict, full-payload, pause/resume, failure, and stable-serialization coverage.
- Run `node --experimental-default-type=module js/database/raw-log-repository.test.mjs` and `js/database/migrations/raw-log-warehouse.test.mjs` for transaction and schema coverage.
- Manual archive test: in Settings, start a date-bounded Raw Log Archive import, pause after a committed page, reload, and resume. Confirm the count grows without duplicates while Items and Purchases behavior remains unchanged.
- Manual fallback test: in an OPFS-unavailable browser/context, confirm the archive reports unavailable while normal profile, item, and purchase workflows remain usable.

## Canonical events (Sprint 10.3)

- Run `node --experimental-default-type=module js/services/history/canonical-event.test.mjs` for parser registration, deterministic Wallet/Blood Bag output, unknown-log state, replay, and duplicate replay coverage.
- Run `node --experimental-default-type=module js/database/migrations/canonical-events.test.mjs` for canonical-event migration coverage.
- Manual test: archive a known Wallet or Empty Blood Bag log, use Settings → Replay Archived Logs, then confirm Canonical Event Diagnostics reports a generated event. Confirm Purchases, Items, conversions, and cost-basis values do not change.

## Core inventory canonical coverage (Sprint 10.4)

- Run `node --experimental-default-type=module js/services/history/core-inventory-parsers.test.mjs` for verified City Shop, Bazaar, Item Market, trade offer, crime rewards, Faction item receive, City find, movement/participant, and unsupported-variant fixtures.
- In Settings → Canonical Event Diagnostics, select **Refresh Coverage**. Confirm counts are labeled as imported-data coverage only, and that unknown types remain Unsupported.
- Replay the archive after importing new logs. Confirm canonical event changes do not alter Items, Purchases, FIFO, conversion history, or cost basis.

## Canonical Transfer Events (Sprint 10.9)

- Run `node --experimental-default-type=module js/services/history/core-inventory-parsers.test.mjs` and `node --experimental-default-type=module js/services/history/canonical-event.test.mjs` for verified send/receive/legacy-receive shapes, UIDs, participants, quantities, unsupported variants, and replay idempotency.
- Replay verified `4101`, `4102`, and `4103` records. Confirm each creates one `transfer` event with no cash movement: `4101` and `4103` use item `in`, while `4102` uses item `out`.
- Confirm the source sender or receiver is preserved as the only known counterparty. Do not expect an inferred local participant, purchase, sale, reward, trade completion, FIFO lot, or cost-basis change.
- Confirm payload signatures other than `item,message,quantity,sender`, `items,message,receiver`, and `items,message,sender` become unsupported rather than being guessed.

## Legacy Item Market Purchase Coverage (Sprint 10.10)

- Run `node --experimental-default-type=module js/services/history/legacy-item-market-profile-service.test.mjs`, `js/services/history/core-inventory-parsers.test.mjs`, and `js/services/history/canonical-event.test.mjs`.
- In Settings, use **Refresh Project Health**. Confirm the Legacy Item Market Purchase (1103) section reports total archived, accepted, rejected, record coverage, parser status, signature counts, row/UID anomalies, seller/cost diagnostics, and grouped rejection reasons without displaying raw values or participant identifiers.
- Replay verified 1103 records: confirm one `acquisition` event with item `in`, cash `out`, seller participant, preserved UID, and `single_item_transaction_total` cost interpretation. Confirm no purchase, FIFO, lot, valuation, or current-accounting side effects.
- Confirm missing/zero/invalid cost, missing seller, empty or malformed item arrays, invalid IDs, non-unit quantities, and multi-row item arrays remain unsupported with no partial event emission.

## Read-Only Accounting Projection Foundation (Sprint 11)

- Run `node --experimental-default-type=module js/database/migrations/accounting-projection.test.mjs`, `js/services/history/accounting-projection.test.mjs`, and `js/services/history/accounting-projection-service.test.mjs`.
- In Settings, select **Run / Rebuild Projection**. Confirm progress reports canonical events examined, projectable, unresolved, and error counts. A completed run may have unresolved trade events but must reconcile all examined events.
- Run it again without canonical changes. Confirm no duplicate projection rows are inserted and existing deterministic rows are reported instead.
- Confirm acquisitions/disposals retain verified item/cash directions, conversions retain both sides without basis allocation, rewards do not receive invented value, transfers remain neutral, and trade events remain unresolved.
- Confirm Items, Purchases, FIFO, Cost Lots, valuation, canonical diagnostics, and raw-log totals are unchanged.

## Torn Log Type Catalog & Coverage Intelligence (Sprint 10.5)

- In Settings, select **Refresh Torn Catalog** and confirm the catalog summary reports total, new, renamed, and inactive counts. Repeat the refresh without a Torn change and confirm no entries are reported as new or renamed.
- Confirm **Refresh Coverage** works without an API request and combines the local archive with registered parsers. Search by exact ID/title and filter every status: Supported, Partially Supported, Unsupported Observed, Awaiting Sample, Ignored, Legacy, and Parser Error.
- Confirm a catalog type with no archived row is Awaiting Sample, an archived type missing/inactive in the current catalog is Legacy, and known Bazaar/Item Market lifecycle types remain Ignored.
- Confirm catalog refresh and coverage never change raw-log counts, canonical event counts, Purchases, FIFO lots, conversions, or cost basis.
- Run `node --experimental-default-type=module js/database/migrations/torn-log-type-catalog.test.mjs`, `node --experimental-default-type=module js/database/log-type-catalog-repository.test.mjs`, and `node --experimental-default-type=module js/services/history/log-type-catalog-service.test.mjs`.

## Legacy Bazaar & Abroad Purchase Canonical Events (Sprint 10.6)

- Run `node --experimental-default-type=module js/services/history/core-inventory-parsers.test.mjs` and `node --experimental-default-type=module js/services/history/canonical-event.test.mjs`.
- Replay verified 1220 and 4201 records: confirm each creates one `acquisition` event with item `in` and cash `out` movements; confirm 1220 retains a seller participant and 4201 stores numeric `attributes.location.area`.
- Confirm missing/invalid item, quantity, cost fields, area (4201), and materially inconsistent unit/total consideration are recorded as unsupported, not as zero-cost acquisitions.
- Run a second replay and confirm the same parser version creates no duplicate canonical events. Confirm Purchases, FIFO lots, conversions, and cost basis remain unchanged.

## Verified Item Conversion Framework (Sprint 10.7)

- Run `node --experimental-default-type=module js/services/history/parsers/item-conversion-parser.test.mjs`, `node --experimental-default-type=module js/services/history/core-inventory-parsers.test.mjs`, and `node --experimental-default-type=module js/services/history/canonical-event.test.mjs`.
- Replay 2350/2360 records: confirm one consumed item uses an `out` movement and the explicit `item2` output uses an `in` movement with the recorded quantity. Confirm the declared `quantity` agrees with the output quantity.
- Replay 2407: confirm one consumed item and one nonnegative cash `in` movement; do not expect profit, lots, FIFO, or purchase-history changes.
- Confirm missing/invalid inputs, missing/invalid output quantities, mismatched declared quantities, duplicate outputs, unsupported structures, and invalid cash become unsupported replay results.
- Run a second replay and confirm no duplicate canonical events are stored.

## Canonical Cash-Sale Events (Sprint 10.8)

- Run `node --experimental-default-type=module js/services/history/parsers/cash-sale-parser.test.mjs`, `node --experimental-default-type=module js/services/history/core-inventory-parsers.test.mjs`, and `node --experimental-default-type=module js/services/history/canonical-event.test.mjs`.
- Replay 1104, 1113, 1221, 1226, and 4210 records: confirm one `disposal` event per record, item `out`, cash `in`, recorded total proceeds, and no accounting side effects.
- Confirm 1104 preserves a valid UID and buyer; 1113 preserves nullable `cost_each`, `fee`, and `anonymous` source fields without using them for net-proceeds math; 1221/1226/4210 reject inconsistent unit and total proceeds.
- Confirm malformed items, invalid quantities, missing/negative proceeds, invalid buyers where required, duplicate item lines, unsupported legacy quantities, and unsupported Item Shop area variants are durable unsupported results.
- Run a second replay and confirm it creates zero additional canonical events.

## Coverage Intelligence (Sprint 10.8.5)

- Run `node --experimental-default-type=module js/services/history/coverage-intelligence-service.test.mjs`, `node --experimental-default-type=module js/database/coverage-snapshot-repository.test.mjs`, and `node --experimental-default-type=module js/database/migrations/coverage-intelligence.test.mjs`.
- In Settings, refresh **Project Health**. Confirm Archive, Warehouse, Replay, Coverage, signature, parser-family, highest-impact, and latest replay metrics are diagnostic only; Items, Purchases, FIFO, and cost basis must not change.
- Replay archived logs, then refresh Project Health. Confirm a compact coverage snapshot is available and a second replay creates no duplicate canonical events.
- Export representative raw logs and confirm export metadata includes per-type observed-record/signature counts, parser status/family, representative signatures, export timestamp, and exported-example count without increasing the number of raw examples.

## Temporary raw-log developer export

- Run `node --experimental-default-type=module js/services/history/raw-log-export-service.test.mjs` for filtered/paged JSONL export, metadata, deterministic ordering, redaction, filename, and source-integrity coverage.
- Manual test: Settings → Raw Log Developer Export, choose a small redacted sample, export it, and parse each line as JSON. The first line is metadata; later lines have `_recordType: raw_log`. Confirm archive counts/checkpoints remain unchanged.
- Full raw output requires confirmation. Treat it as private account activity and review the downloaded file before attaching it for parser analysis.

## Sprint 9 - Inventory Conversion Engine & Market Valuation

- Run `node --experimental-default-type=module js/services/conversion-service.test.mjs` to validate FIFO ordering, partial consumption, unresolved handling, cash recovery/gain, effective-value allocation, immutable input snapshots, and verified conversion mappings.
- Select an owned item after the Torn item catalog has loaded: confirm Current Market Value, Vendor Sell Value, Effective Value, Estimated Inventory Value, and Last Market Update are informational fields and do not alter its known cash cost basis.
- Import logs containing the verified `Item use wallet` and `Item use empty blood bag` events. Open Conversion History: confirm newest-first rows show input, cash, outputs, original basis, historical value received, and net realized gain/loss.
- For a multi-output test conversion, confirm the stored allocated output bases plus cash basis recovered equal original known basis, with any cent remainder assigned to the highest effective-value output.
- Open two same-item input lots bought at different prices, then process two conversions: confirm the first record uses the older price and the second uses the next FIFO lot price. Confirm Net Gain/Loss is green for a positive market-snapshot value difference and red for a negative one; it is informational and separate from cash-only realized gain/loss.
- Interrupt a conversion processing attempt through a missing required multi-output value: confirm no lot quantities or conversion history rows are partially committed; restore the required data and retry.
- Import a conversion whose input item has no tracked acquisition lot: confirm purchase synchronization completes, Conversion History shows an unresolved row, and no input/output cost lots are created or consumed.

## v0.8.0-alpha1 - Acquisition Performance, Cost Lots & Conversion Valuation

- Run `node --experimental-default-type=module js/api-queue.test.mjs`: confirm 1,200 ms request-start spacing, stable queue order, no concurrent work, no idle-queue burst, recoverable failure handling, and rate-limit backoff.
- Run `node --experimental-default-type=module js/api.test.mjs`: confirm Torn v1 and v2 endpoint methods enter the same shared scheduler.
- Refresh Items and watch the upper-right status line: it identifies the current category, for example `Downloading Inventory: Melee (5/25)...`; categories continue in order and the final summary remains accurate.
- For a controlled comparison, record the item-sync request count and elapsed duration before/after this release. Repeat for purchase history with the selected lookback period, recording page count and duration. Confirm no missing or duplicated records, no out-of-order pages, and no ordinary-use rate-limit errors. Avoid repeated cache-cleared large imports solely to stress Torn's API.

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
- Confirm travel-log area mappings display the correct country: Mexico (2), Hawaii (3), South Africa (4), Japan (5), China (6), Argentina (7), Switzerland (8), Canada (9), United Kingdom (10), UAE (11), and Cayman Islands (12).
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

## v0.7.1-alpha1 - In-App README

- Open Readme through VS Code Live Server: confirm it displays the current root README with headings, lists, links, code, and application-themed styling.
- Temporarily make README fetching fail in browser developer tools: confirm the friendly error and Retry control appear, then restore the request and confirm Retry loads the document.
- Confirm repository-relative links resolve under the current Live Server/GitHub Pages application path, while external links open with `noopener noreferrer`.
- Update README.md, redeploy, and reload the browser: confirm the Readme route displays the deployed revision.
- Navigate away from Readme and back: confirm navigation remains functional and the README is shown again.
- Run `node --experimental-default-type=module js/services/markdown-renderer.test.mjs` to validate headings, lists, links, fenced code, relative paths, and safe raw-HTML handling.

## v0.7.2-alpha2 - Collapsible Sidebar Navigation

- Select the hamburger button: confirm the sidebar collapses to icon-only navigation, the main content expands, and the active route remains highlighted.
- Hover or focus each collapsed navigation icon: confirm its native page-name tooltip and accessible button label remain available; navigate through every route in both states.
- Reload while collapsed, then expanded: confirm the preferred state persists and the hamburger's label and `aria-expanded` state are correct.
- Enable reduced motion in the operating system/browser: confirm sidebar transitions are effectively disabled.
- Check Items, Item Details, Purchases, Readme, Settings, status bar, and footer in both sidebar states for overlap or page-wide horizontal overflow.
- Run `node --experimental-default-type=module js/sidebar-controller.test.mjs` to validate state toggle, ARIA updates, and persistence.

## Sprint 8.2 - Acquisition Source Expansion

- Verify paid lots contribute known cash cost, while confirmed zero-cost lots contribute quantity and $0 to the average/low price.
- Import or normalize a `Faction give item receive` (log type 6733) entry with `data.item: [{ id, qty }]`: confirm it appears as Faction Gift, retains the item quantity, and contributes a confirmed $0 cash lot without matching faction loans or other faction events.
- Import or normalize a `City item find` (log type 7011) entry with scalar `data.item`: confirm it appears as City Find, defaults to one item, and contributes a confirmed $0 cash lot without matching other City events.
- Verify non-cash and unresolved lots contribute matched quantity but not priced quantity or known cash cost.
- Verify Bazaar add/remove/edit/open-close/sell and trade initiate/expire/item-add lifecycle logs do not create acquisitions.
- During a purchase sync, inspect only the bounded `Unsupported incoming acquisition signatures` console diagnostic. It must list no values beyond log type, title, field names, and occurrence count.
- Confirm legacy locally cached acquisition records remain readable and receive the new cost-classification fields after access.
- Run `node --experimental-default-type=module js/services/analysis/cost-basis-service.test.mjs` for paid, zero-cost, non-cash, unresolved, legacy, and lifecycle-exclusion coverage.

## v0.7.2-alpha3 - Unique Equipment Quantity Aggregation

- Refresh with two or more uniquely-instanced weapons/armor sharing one base item ID: confirm the Items row and Item Details source quantity equal the number of instances.
- Confirm a stackable row with an explicit amount remains unchanged, and an instance row without an amount counts as one.
- Repeat the same successful item refresh: quantities must remain unchanged rather than accumulating.
- Remove an item from a successful source response: confirm that source quantity clears while quantities in other locations remain.
- Sync while Bazaar is closed/unavailable: confirm its cached quantity remains unchanged.
- Confirm corrected total quantity appears in snapshots and changes current-quantity/coverage values in Item Details > Purchases.
- Run `node --experimental-default-type=module js/stores/items-aggregation.test.mjs` for all-location duplicate aggregation, replacement, idempotency, cache preservation, cost-basis, and snapshot coverage.
- Manual browser test: use Settings → Raw Log Archive, start a bounded historical import, pause after a committed page, refresh, and use Resume. Confirm the archived count increases without duplicates and the Purchases/Items LocalStorage workflows are unchanged.
- Manual fallback test: use a browser/context without OPFS support and confirm the archive controls report unavailable while normal profile, item, and purchase workflows still start.
