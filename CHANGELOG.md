# Sprint 10.2 - Raw Log Warehouse and Historical Import Foundation
- Added SQLite migration 002 with immutable `raw_logs`, durable import runs, resumable checkpoints, and conflict diagnostics.
- Added a user-triggered Settings archive workflow for historical and incremental raw Torn log imports, with pause, resume, cancel, retry, and local diagnostics.
- Added canonical JSON SHA-256 hashing, duplicate-safe source-log IDs, conflict preservation, batched transactions, and a future parser/replay contract.
- Kept LocalStorage purchases, FIFO, conversions, and cost basis fully authoritative and unchanged.

# v0.5.2
Item Store added.

## SQLite Migration Foundation
- Added an official SQLite WASM 3.53.3 vendor bundle, worker lifecycle, OPFS capability diagnostics, and numbered migration runner.
- Kept LocalStorage stores active while SQLite repository migration is planned and validated incrementally.

## v0.8.0-alpha1 - Acquisition Performance, Cost Lots & Conversion Valuation
- Replaced the shared post-response 2,500 ms pause with a centralized 1,200 ms minimum interval between Torn API request starts.
- Kept every Torn v1 and v2 request in one ordered, single-request scheduler, covering profile, inventory, Bazaar, Display Case, Item Market, logs, and the item catalog.
- Added conservative ordered rate-limit backoff (5, 10, then 20 seconds) with a visible status message and no request burst after idle or background-tab delays.
- Updated Inventory status text to name the category currently being downloaded.
- Added verified `Faction give item receive` ingestion as a Faction Gift with a confirmed $0 cash cost.
- Added verified `City item find` ingestion as a City Find with a confirmed $0 cash cost.

## Sprint 9 - Inventory Conversion Engine & Market Valuation
- Added a persistent, account-scoped cost-lot ledger with an explicit FIFO costing strategy.
- Added ConversionService, immutable ConversionStore records, and verified wallet/blood-bag conversion event mappings.
- Added MarketValueService using Torn Items values, preserving market price, vendor sell price, and effective value separately.
- Added Conversion History and Item Details market-value information.
- Corrected Conversion History to display market-snapshot value difference separately from realized cash gain/loss and to color positive/negative values.
- Clearing the purchase cache now also clears the dependent conversion ledger so a new initial sync rebuilds FIFO lots correctly.
- Treat conversions with insufficient tracked input history as unresolved audit records instead of blocking purchase synchronization.

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

## Sprint 6 - Snapshot Engine
- Added event-driven SnapshotService to capture owned-item history after synchronization.
- Added HistoryStore with persistent snapshots and configurable retention hooks.

## Sprint 7 - Purchase Log Ingestion
- Added canonical Acquisition records and account-scoped PurchaseStore persistence.
- Added PurchaseLogImporter and PurchaseSyncService for initial and incremental Torn log synchronization.
- Added Purchases setup, progress, reset, summary, and acquisition DataGrid states.
- Corrected Torn v2 log-title/payload decoding and added a confirmed Settings purchase-cache reset.
- Added a confirmed Settings item-cache reset and item-name labels in purchase rows when the item is cached.
- Added Torn's `Bazaar buy` and `Item market buy` log-title variants to purchase ingestion.
- Switched purchase-log pagination to Torn's continuation links and removed the redundant Purchases reset control.
- Continued timestamp pagination after Torn's non-terminal short log pages.
- Added City Shop and Abroad Shop purchase-source recognition.
- Added country-aware Abroad purchase labels and line-level quantity/item-name columns.
- Added a persistent global Torn Item Catalog for complete purchase item-name resolution.
- Corrected the confirmed travel-log area mapping for Cayman Islands.
- Added confirmed Mexico, Hawaii, China, Switzerland, Canada, and United Kingdom travel-log area mappings.
- Completed confirmed Abroad purchase area mappings for South Africa, Japan, Argentina, and UAE.

## Sprint 8 - Current Holdings Cost Basis
- Added CostBasisService for newest-acquisition-first current-holdings estimates with partial-lot matching.
- Added Item Details Purchases tab with quantity/priced coverage, transparent warnings, and matched-lot provenance.
- Kept unresolved acquisitions as matched quantities without inventing a cost.

## Sprint 8.1 - Purchases UX Cleanup & DataGrid Selection
- Simplified Item Details Purchases to cost-basis summary, dates, and warnings.
- Added local Purchases search without recreating the persistent DataGrid.
- Added stable-key DataGrid row selection and selected-item highlighting.

## v0.7.1-alpha1 - In-App README
- Added a Readme route that renders the repository root README.md in the application.
- Added a safe internal Markdown renderer, loading/error/retry states, and GitHub Pages-compatible relative paths.

## v0.7.2-alpha1 - Tester Experience Polish
- Added application branding and section-specific navigation icons.
- Refined the application status area to show player identity, item sync, purchase sync, and current status clearly.
- Completed the confirmed Torn Abroad purchase-area mapping.

## v0.7.2-alpha2 - Collapsible Sidebar Navigation
- Added a persisted, accessible sidebar collapse control with icon-only navigation mode.
- Added smooth layout transitions and reduced-motion support.

## Sprint 8.2 - Acquisition Source Expansion
- Added canonical paid, free, non-cash, and unresolved acquisition cost classifications.
- Updated known cash cost basis to include valid zero-cost lots without treating non-cash or unresolved lots as free.
- Added explicit Bazaar/trade lifecycle exclusions and a bounded unsupported incoming-signature diagnostic.

## v0.7.3-alpha1 - Expanded Acquisition Coverage & Quantity Accuracy
- Added explicit paid, free/zero-cash, non-cash, and unresolved acquisition cost classifications.
- Preserved verified paid acquisition sources while adding safe unsupported incoming-item diagnostics for future source discovery.
- Fixed duplicate same-ID equipment rows being overwritten instead of summed within a source sync.
- Added one-unit fallback for uniquely-instanced source rows without an explicit quantity.
- Preserved source replacement, cached unavailable-source behavior, and base-item-only Items rows.
