# Architecture

## SQLite migration foundation

The active application still uses LocalStorage stores. SQLite infrastructure is intentionally dormant while repositories are introduced one persistence domain at a time. The planned boundary is `UI -> services -> repository interfaces -> SQLite repositories -> worker-hosted SQLite WASM/OPFS`. SQL, schema migrations, and transactions stay inside `js/database`; services and views will not contain SQL. See [SQLite Migration Plan](SQLITE_MIGRATION_PLAN.md) for the selected official-WASM/OPFS approach, browser limitations, schema, and phased cutover.

### Raw log warehouse

`Torn API -> RawLogImportService -> RawLogRepository -> SQLite raw_logs -> future ParserRegistry -> future canonical events/replay`

The raw-log warehouse is an optional, user-triggered SQLite archive. It stores complete canonical source objects without creating accounting records. `RawLogRepository` owns raw rows, import runs, conflicts, and checkpoints. A matching source ID/hash updates only `last_seen_at`; a differing hash creates a conflict record and preserves the original source payload. Historical imports prefer Torn continuation links and deliberately overlap timestamp boundaries when needed; source-ID uniqueness prevents duplicates while avoiding boundary loss. The Settings controls are independent of Purchases and every existing LocalStorage accounting path.

### Canonical events and parser replay

`raw_logs -> ParserRegistry -> canonical_events -> future accounting / analytics / replay projections`

Canonical events are derived, replayable SQLite records, never replacements for immutable raw evidence. Migration 003 adds one generic `canonical_events` envelope and `processing_state` keyed by source log, parser name, and parser version. The envelope contains broad event type, participants, generic resource movements, attributes, source metadata, parser version, and canonical schema version. It does not include FIFO, lots, cost basis, or mechanic-specific tables.

`ParserRegistry` is the parser boundary for new raw-log interpretation. The initial verified Wallet and Blood Bag parsers normalize item/cash movements into broad `conversion` events. Unknown logs become durable `unsupported` states; malformed parser output becomes an `error` state. `ReplayService` reads archived raw logs chronologically and upserts deterministic event IDs (`source log + parser + version + output index`), allowing safe repeated replay and future parser-version upgrades. Existing LocalStorage purchase/conversion accounting does not consume canonical events during this sprint.

Core inventory coverage adds City Shop, Bazaar, Item Market, observed trade lifecycle, crime item/cash reward, Faction item receive, and City item find parsers. They report observable generic movements only. In particular, observed trade initiation/offer/expiry data does not establish a completed trade, so it is recorded as transfer/activity evidence rather than an acquisition or disposal. Coverage diagnostics group imported log types by title, payload-field signature, first/last seen time, count, selected parser/version, and Supported/Partially Supported/Unsupported status. This percentage is strictly coverage of imported archive data, not Torn-wide coverage.

Legacy Bazaar purchase (`1220`) and Abroad purchase (`4201`) extend the configured canonical purchase parser rather than adding a separate accounting path. Their verified scalar payloads require item, quantity, unit cost, and total cost; invalid or materially inconsistent records are unsupported. `1220` adds an optional seller participant, while `4201` keeps numeric `area` in generic location attributes. Both parser definitions currently report partial coverage because the representative export does not establish every archived payload signature. They create only generic canonical acquisition movements and remain disconnected from LocalStorage accounting.

### Torn log type catalog and coverage intelligence

`Torn logtypes endpoint -> LogTypeCatalogService -> LogTypeCatalogRepository -> SQLite torn_log_types` joins separately with `raw_logs -> ParserRegistry` for diagnostics. Migration 004 stores current ID/title reference data and keeps non-destructive change history for new IDs, title changes, and entries no longer returned by Torn; missing entries are inactive, never deleted. The catalog is refreshable only through `js/api.js` and the shared request queue.

Catalog titles are reference data, not parser or accounting instructions. A small explicit classification map records manual relevance decisions. Coverage states distinguish Supported, Partially Supported, Unsupported Observed, Awaiting Sample, Ignored, Legacy, and Parser Error; they are based on observed payload variants in the local archive. This service does not write raw logs, canonical events, acquisitions, lots, conversions, or cost-basis results.

### Raw log developer export

`Settings -> RawLogExportService -> RawLogRepository -> JSONL Blob -> local browser download`

Developer export is read-only: the repository selects only `raw_logs` (and uses `processing_state` only through `EXISTS` filters), while the service pages records in deterministic timestamp/source-ID order. JSONL begins with an export metadata record followed by compact raw-log envelopes containing the original stored individual raw JSON object. No settings, API-key, OPFS, or database-connection data is read or exported.

Redaction is a dedicated in-memory pass, never a database update. It removes obvious secret/free-text fields and deterministically pseudonymizes likely participant/faction identifiers within one export; it retains log type, titles, timestamps, item IDs/names, quantities, and values needed for parser work. Redaction is not a guarantee of anonymity. Full raw export requires an immediate confirmation dialog. Large exports page in batches and yield between pages, but browser Blob construction still ultimately holds the generated file in memory; formal backup/restore is deferred.

## Torn API scheduling

`API endpoint method -> TornRequestQueue -> fetch -> importer/service`

`js/api.js` is the only application module that calls Torn. Its v1 and v2 endpoint methods use the same `TornRequestQueue` instance in `js/api-queue.js`, so profile validation, owned-item sources, purchase-log pages, and item-catalog requests retain one deterministic order. The queue permits one active request and enforces a 1,200 ms minimum interval between request starts (about 50 starts per minute), rather than a fixed post-response pause. This intentionally leaves headroom below Torn's stated request allowance for normal gameplay, other tabs/tools, timing variation, and later synchronization sources.

If Torn returns HTTP 429 or an equivalent rate-limit error, the queued request retries in place after 5, 10, and 20 seconds at most. The queue emits a concise status event while waiting. Failed requests do not block later work, and a delayed browser timer cannot cause a catch-up burst because each new request still becomes the sole next start.

## Owned items

`Torn API -> source importer -> ItemSyncService -> ItemStore -> OwnedItem -> views`

Each `OwnedItem` is the canonical current-holdings record. Its `totalQuantity` is the sum of Inventory, Bazaar, Item Market, and Display Case quantities. Importers alone understand source-specific Torn API response fields.

Importers return one normalized record per Torn source row. ItemStore aggregates duplicate base item IDs within the current source batch, then replaces only that source's previous quantity. It never adds the fresh aggregate to cached source data, so repeated synchronization is idempotent. Unique equipment UID and stat payloads are intentionally deferred; current ownership remains one OwnedItem per base Torn item ID.

## Purchase history

`Torn user logs -> PurchaseLogImporter -> PurchaseSyncService -> PurchaseStore -> acquisition views`

`Acquisition` records are normalized and account-scoped. PurchaseStore persists compact transaction and item-line data, not raw Torn log responses. A source importer is responsible for any safe cost allocation; downstream analysis never derives a unit price from a transaction total.

## Current-holdings cost basis

`OwnedItem + PurchaseStore acquisitions -> CostBasisService -> ItemDetails Purchases tab`

CostBasisService is a pure, non-persistent analysis service. It takes matching normalized item lines from supported acquisition sources and consumes them newest first until current `totalQuantity` is covered. A lot may be partially used. Equal timestamps use descending acquisition ID as a deterministic secondary sort, so estimates do not change between runs.

Quantity coverage (`matched/current`) and priced coverage (`reliably priced/current`) remain separate. Unresolved lines, such as a multi-item trade with no safe allocation, can cover quantity but contribute no known cost. This is an estimate: acquisition history may omit gifts, rewards, crimes, sales, transfers, item use, and history outside the imported range.

Acquisition cost semantics are explicit: `paid/known` lots contribute cash cost; `free/zero` lots are valid $0 cash lots; `nonCash` lots retain quantity without an invented dollar amount; and `unresolved` lots retain quantity without a safe cash allocation. Internal movements between the player's locations never become acquisitions. Future economic or inherited-cost analysis can build on these canonical classifications without changing known cash cost basis.

Current importer support is intentionally verified-only: Bazaar, Item Market, Abroad, existing City Shop matching, supported paid trades, confirmed zero-cost gifts/finds, and the verified wallet/blood-bag conversion events are normalized. Bazaar add/remove/edit/open-close/sell and trade initiate/expire/item-add lifecycle entries are explicitly excluded. Additional gifts, rewards, conversion mechanics, Item Market return, Display Case movement, and City Shop variants remain pending exact Torn log payload and direction confirmation.

## Inventory conversion ledger and valuation

`Purchase acquisitions + normalized conversion events -> CostLotStore -> CostingStrategy -> ConversionService -> ConversionStore`

Cost lots are account-scoped remaining quantities with a cost-status boundary (`known`, `zero`, `nonCash`, or `unresolved`). `FifoCostingStrategy` is the only active strategy: it sorts eligible lots by ascending timestamp then stable lot ID, supports partial consumption, and returns a new lot snapshot rather than mutating input data. ConversionService is strategy-agnostic; it validates complete input consumption, then atomically commits resulting lots and the conversion record through the shared ledger store.

MarketValueService reuses `API.getTornItems()` and stores three distinct values per item: current market price, vendor sell price, and effective value (the greater recoverable value). Market values are informational outside conversions. A multi-output conversion snapshots its effective values and allocation percentages permanently; later refreshes cannot change historical output basis. Cash recovers at most the known input basis; remaining basis is allocated in cents, and any rounding remainder is assigned to the highest-value output. Unknown/unresolved input basis stays unresolved rather than becoming zero.

## DataGrid selection

DataGrid remains display-state only. Consumers may configure `rowKey` or `getRowKey` to enable generic stable-key selection; DataGrid then exposes `setSelectedRowKey(key)` and marks visible selected rows with `aria-selected` and a CSS class. Views continue to own row-click behavior and event publication. The Items view uses `OwnedItem.id`, so selection does not rely on transient store object references.

## In-app README

`Readme view -> fetch root README.md -> markdown-renderer -> application content area`

The Readme view fetches the repository's root README at runtime and only caches it for the current browser session. `markdown-renderer` creates DOM nodes directly for headings, paragraphs, lists, links, inline and fenced code, blockquotes, horizontal rules, tables, and images. Raw Markdown HTML is unsupported and rendered as text. Links and images resolve relative to the deployed application directory, allowing the same relative README references to work through Live Server and GitHub Pages. Unsafe URL protocols are rejected; external links receive `target="_blank"` and `rel="noopener noreferrer"`.

## Application shell navigation

`sidebar-controller -> body.sidebar-collapsed -> shell CSS layout`

The application shell stores one local preference, `tct.ui.sidebarCollapsed`. The controller restores it on startup and updates the toggle's ARIA state; CSS controls the sidebar and main-content grid widths, collapsed branding and labels, icon alignment, and reduced-motion behavior. Routed views do not own or depend on sidebar state.
