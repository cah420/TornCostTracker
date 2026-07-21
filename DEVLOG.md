# Development Log

## Sprint 10.6 - Legacy Bazaar & Abroad Purchase Canonical Events

The canonical purchase family now covers the verified legacy Bazaar buy (`1220`) and Abroad buy (`4201`) payloads without touching purchase synchronization, lots, FIFO, conversions, or cost basis. Both source shapes are strict scalar purchases: positive numeric `item` and `quantity`, nonnegative numeric `cost_each` and `cost_total`, and a materially consistent unit-times-quantity total are required. Valid records produce one generic acquisition event with item-in and cash-out movements. Legacy Bazaar preserves an optional seller participant; Abroad preserves `area` under generic `attributes.location` rather than translating it into a country-specific schema.

The supplied representative export contained one top-level payload-field signature for each type, but did not include complete archived signature counts. The two parsers therefore declare partial coverage. Any malformed or unverified variant becomes a durable unsupported replay result rather than a zero-cost or incomplete acquisition. Deterministic fixtures cover normal and multi-quantity records, participants/location metadata, invalid fields, inconsistent totals, and duplicate replay behavior.

## Sprint 10.5 - Torn Log Type Catalog & Coverage Intelligence

The archive now has a reference-data catalog for Torn log type IDs. `LogTypeCatalogService` downloads `torn/?selections=logtypes` through the shared API queue, normalizes the ID/title map, and delegates persistence to `LogTypeCatalogRepository`. Migration 004 keeps the current catalog row, first/last observation time, active state, title hash, source version, and import time. New IDs, renamed titles, and IDs absent from a later refresh are recorded as change rows; absent IDs are marked inactive rather than deleted.

Coverage is deliberately a diagnostic join, not a new accounting path. It compares catalog entries with locally observed raw logs and the existing parser registry, reporting supported, partial, unsupported-observed, awaiting-sample, ignored, legacy, and parser-error states. Accounting relevance is an explicit small reviewable mapping; titles alone never select parsers or make accounting decisions. The Settings panel supports a manual Torn catalog refresh, local coverage refresh, and filtering by ID/title and status. Raw evidence, canonical replay behavior, LocalStorage purchases, lots, conversions, and cost basis remain unchanged.

## Sprint 10.3 - Canonical Event Framework & Parser Infrastructure

The SQLite archive now has a derived canonical-event layer: immutable `raw_logs` flow through a versioned `ParserRegistry` into one generic `canonical_events` envelope. Movement records describe broad resource changes (`in`, `out`, and related directions) across extensible resource types rather than creating mechanic-specific tables. Parser version, canonical schema version, and future ledger/projection version are separate concepts.

Migration 003 persists canonical output and one processing-state row per source-log/parser-version. Replay uses deterministic IDs from the source log, parser name/version, and output index, so replays are duplicate-safe and a parser upgrade can be retained separately. The first verified parsers handle Wallet and Empty Blood Bag conversion logs only; unknown logs become explicit unsupported states and parser failures are stored as errors. No LocalStorage accounting path reads canonical events yet.

## Temporary Raw Log Developer Export

The OPFS archive can now be shared for development through a deliberate local JSONL export rather than direct browser-storage access. RawLogExportService filters and pages `raw_logs` through the repository, constructs metadata plus one raw-log envelope per line, and downloads a Blob without sending data anywhere. It never queries settings and never mutates archive, parser, or accounting tables.

Redacted export is the default. Its in-memory pass masks obvious secrets/free text and uses deterministic pseudonyms for likely participant/faction fields while retaining mechanics data such as log/item IDs, quantities, values, titles, and timestamps. It is not a complete anonymity guarantee. Full raw export requires an immediate checkbox confirmation. Large exports yield between pages but Blob output remains memory-bound until a later formal backup/export design.

## Sprint 10.4 - Core Inventory Event Coverage

The canonical layer now recognizes the core inventory-affecting shapes observed in the approximately eight-day archive sample: City Shop, Bazaar, Item Market, trade initiation/offer/expiry, crime item/cash rewards, Faction item receive, and City item find. Each parser produces only generic acquisition, reward, transfer, or activity events and movements. No parser creates an accounting acquisition, FIFO lot, valuation, or cost result.

Trade handling is intentionally conservative. The observed archive shows lifecycle and counterparty-offer events, not enough evidence to assert completed ownership transfer, so it records offered item movements and activity context only. Parser coverage diagnostics group imported records by type/title and payload-field signature, showing selected parser version and imported-data-only support status. Fixtures mirror verified redacted payload structures; unrecognized variants remain durable unsupported results for later discovery.

## Sprint 10.2 - Raw Log Warehouse and Historical Import Foundation

SQLite now has an immutable raw Torn log warehouse without migrating any active accounting store. Migration 002 adds `raw_logs`, `log_import_runs`, `sync_checkpoints`, and `raw_log_conflicts`. Each raw row keeps the complete individual source object as canonical JSON plus a Web Crypto SHA-256 payload hash. The source ID is unique: repeat observations update only `last_seen_at`, while a changed source payload creates a durable diagnostic and leaves original evidence untouched.

`RawLogImportService` is a separate Torn-log archival path. It uses the existing shared API queue but does not call PurchaseLogImporter or any accounting service/store. Historical imports are explicitly started in Settings, process newest-to-oldest using Torn continuation URLs where available, commit batches and checkpoints together, and can pause, cancel, fail, refresh, and resume without deleting archived data. Incremental archive sync deliberately overlaps the newest timestamp and relies on source-ID uniqueness. Browser interruption changes durable running imports to paused at the next successful SQLite startup.

The archive remains optional: SQLite/OPFS failure leaves all existing LocalStorage application behavior operational. The parser registry added this sprint is a contract only; parser, ledger, and schema versions are documented as separate concerns. No acquisitions, lots, FIFO results, conversions, or current cost basis results are derived from archived raw logs yet.

## SQLite Migration Foundation

The application now initializes a dormant SQLite foundation on startup without changing any active LocalStorage-backed store. `DatabaseClient` owns worker lifecycle and graceful capability fallback; the dedicated module worker owns the pinned official SQLite WASM runtime, OPFS `opfs-sahpool` VFS, SQL, foreign-key enforcement, transaction batches, and export plumbing. If OPFS, worker support, or initialization is unavailable, diagnostics report compatibility mode and the SPA continues normally.

The first numbered migration establishes `schema_migrations` and `application_metadata`. It is repeatable and tested. The detailed repository audit, selected implementation, browser tradeoffs, phased schema, migration sequence, and testing matrix live in `docs/SQLITE_MIGRATION_PLAN.md`. No LocalStorage key is deleted, and no existing service or view has been switched to SQLite yet.

## v0.8.0-alpha1 - Inventory Conversion Engine & Market Valuation

Inventory accounting now has a dedicated ledger boundary: `Acquisitions + Conversion Events -> Cost Lots -> Conversion History`. `CostLotStore` and `ConversionStore` share one account-scoped persisted ledger document, allowing a conversion's consumed lots, output lots, processed-event marker, and immutable history record to commit together. Existing acquisition records create lots only once; verified conversion events are retained independently so interrupted processing can safely retry without consuming a lot twice.

`CostingStrategy` is an explicit pure contract. The active `fifo` strategy consumes the oldest remaining lots with a stable lot-ID tiebreaker, supports partial lots and confirmed zero-cost lots, and carries unresolved/non-cash quantities forward without inventing a cost. ConversionService requests consumption through that boundary and never selects or decrements FIFO lots itself.

MarketValueService uses the existing shared `API.getTornItems()` request and stores `marketPrice`, `vendorSellPrice`, and `effectiveValue = max(marketPrice, vendorSellPrice)` separately. Multi-output conversions snapshot those effective values and allocate the remaining cents of basis proportionally; any rounding remainder goes to the highest-value output. Cash first recovers up to the input basis, never creates negative basis, and produces a realized gain only when cash exceeds known basis. One-output conversions transfer available basis without requiring a valuation.

The verified conversion registry currently recognizes `Item use wallet` (type 2405: item input, item outputs, optional cash) and `Item use empty blood bag` (type 2340: item input to blood-bag output). The accounting engine does not contain Cardholder, Old Wallet, or Blood Bag item IDs; future verified mappings supply the same canonical input/output/cash event shape.

Conversion History now shows an informational `estimatedValueDelta`: the immutable conversion-time value received (cash plus output effective values) less original known basis. It is distinct from `realizedGain`/`realizedLoss`, which remain cash-only accounting outcomes. The UI colors positive value differences green and negative differences red. Purchase-cache clearing also clears the dependent conversion ledger, preventing stale processed-event markers or prior lots from contaminating a rebuilt FIFO history.

An insufficient historical input lot no longer aborts purchase synchronization. ConversionService records that event as an unresolved audit row with its input/output/cash details and an explicit reason, while leaving every lot unchanged and creating no output cost lots. This preserves atomic accounting safety: unknown basis is never silently changed to zero, but an incomplete selected history range cannot prevent later supported acquisitions and conversions from importing.

## Data Acquisition Performance (included in v0.8.0-alpha1)

All Torn API endpoints now share `TornRequestQueue` in `js/api-queue.js`. The queue allows one request at a time and records each request start, enforcing a 1,200 ms minimum before the next start rather than adding a fixed pause after the prior response. This targets roughly 50 starts per minute, deliberately below Torn's stated allowance so gameplay, other browser tabs, timing variation, and future sources retain headroom.

HTTP 429 and equivalent Torn rate-limit errors remain at the head of the ordered queue for conservative retries: 5 seconds, then 10, then 20 seconds, capped at three retries. Other failures continue to propagate without blocking later queued work. The queue emits a status message for rate-limit backoff without exposing request URLs, API keys, or response data.

InventoryImporter already reports its active category. ItemSyncService now turns that importer progress into user-facing messages such as `Downloading Inventory: Melee (5/25)...`, so the upper-right status bar and Items progress text identify the work in progress without coupling UI components to importer internals.

`PurchaseLogImporter` now recognizes the exact Torn title `Faction give item receive` (log type 6733) as a verified external Faction Gift. Its `data.item` array is normalized into canonical item lines with `acquisitionKind: free` and `costStatus: zero`, producing a valid $0 known-cash lot. This matcher deliberately does not include faction loans, returns, rewards, or other faction events without separately verified direction and payloads.

The exact `City item find` title (log type 7011) is also a verified external City Find. Its scalar `data.item` ID normalizes to one free, zero-cash item line; a future explicit quantity would be preserved by the same normalizer. Other City events remain excluded until their direction and payloads are confirmed.

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

## Sprint 8.2 - Acquisition Source Expansion

Acquisitions now carry explicit `acquisitionKind`, `costStatus`, and `acquisitionMethod` fields. Paid/known and confirmed free/zero-cost lots are priced cash lots; non-cash and unresolved lots remain matched quantities but never receive an invented cash value. Legacy cached acquisitions migrate to the paid/known model unless their existing allocation status is unresolved.

PurchaseLogImporter continues to normalize only verified paid sources and existing trade behavior. Bazaar add/remove/edit/open-close/sell and confirmed trade lifecycle entries are excluded as internal movement or lifecycle events. Its development diagnostic emits only unsupported item-bearing signature metadata: log type, title, field names, and occurrence count.

## v0.7.3-alpha1 - Expanded Acquisition Coverage & Quantity Accuracy

This release expands the acquisition-cost foundation while improving owned-item accuracy. Importers continue to decode verified paid sources and now retain explicit cash-cost semantics for future acquisition types. They also decode source rows with a quantity fallback of one for UID-style equipment rows with no amount. ItemStore owns same-source batch aggregation: it sums normalized rows by base item ID and source before replacing that source's prior cached quantity. This makes refreshes idempotent and keeps one canonical OwnedItem per base ID. UID and equipment-stat metadata are intentionally not persisted until a dedicated instance-detail feature defines how it will be used.
