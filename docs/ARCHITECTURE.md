# Architecture

## SQLite migration foundation

The application is in a staged persistence migration. Purchases is SQLite-backed; owned-item synchronization and some compatibility consumers still use LocalStorage. The enforced boundary is `UI -> services -> repository interfaces -> SQLite repositories -> worker-hosted SQLite WASM/OPFS`. SQL, schema migrations, and transactions stay inside `js/database`; services and views do not contain SQL. See [SQLite Migration Plan](SQLITE_MIGRATION_PLAN.md) for browser limitations, schema, and phased cutover.

### Raw log warehouse

`Torn API -> RawLogImportService -> RawLogRepository -> SQLite raw_logs -> future ParserRegistry -> future canonical events/replay`

The raw-log warehouse is an optional, user-triggered SQLite archive. It stores complete canonical source objects without creating accounting records. `RawLogRepository` owns raw rows, import runs, conflicts, and checkpoints. A matching source ID/hash updates only `last_seen_at`; a differing hash creates a conflict record and preserves the original source payload. Historical imports prefer Torn continuation links and deliberately overlap timestamp boundaries when needed; source-ID uniqueness prevents duplicates while avoiding boundary loss. The Settings controls are independent of Purchases and every existing LocalStorage accounting path.

### Canonical events and parser replay

`raw_logs -> ParserRegistry -> canonical_events -> future accounting / analytics / replay projections`

`Raw Log → Canonical Event → Accounting Projection → Accounting Ledger → Immutable Cost Lots → Immutable FIFO Consumption Records → Inventory Position Projection → Purchases Query Service → SQLite-Backed Purchases UI → Future Valuation → Future SQLite-Backed Application Feature Parity`

Canonical events are derived, replayable SQLite records, never replacements for immutable raw evidence. Migration 003 adds one generic `canonical_events` envelope and `processing_state` keyed by source log, parser name, and parser version. The envelope contains broad event type, participants, generic resource movements, attributes, source metadata, parser version, and canonical schema version. It does not include FIFO, lots, cost basis, or mechanic-specific tables.

Migration 006 adds the separate Accounting Projection boundary. `AccountingProjectionService` pages canonical events only, applies versioned projection policies, and stores deterministic projection IDs in `accounting_projections`; it never reads raw payloads or updates canonical rows. Each event receives exactly one controlled outcome: projectable, neutral, unresolved, ignored, or projection error. Paid acquisitions/disposals, conversions, wallet events, rewards, transfers, and trade lifecycle are explicitly separated. Transfers remain neutral, while current trade events remain unresolved pending correlation. Projection runs store rebuild/reconciliation metrics, but no ledger postings, cost lots, FIFO, value, profit, or active accounting changes are in scope.

Migration 007 adds the independent Accounting Ledger boundary. `AccountingLedgerService` pages persisted projection rows only and uses a controlled, ordered policy registry to write deterministic `accounting_ledger_transactions` and `accounting_ledger_lines`. Posted integer-cash transactions must balance per transaction and globally; non-cash rewards and item-only conversions remain deferred, transfers are memorandum-only, and incomplete trades remain unresolved. The ledger is diagnostic and rebuildable, never authoritative for Purchases, inventory, LocalStorage FIFO/lots, valuation, or profit/loss.

Migration 008 adds the independent Cost Lot boundary. `CostLotService` pages persisted Ledger v1 transactions only and records one deterministic source disposition for each. Eligible item-entry lines become one shared lot group per ledger transaction and one child lot per stable line occurrence. Lot Group preserves shared economic context; Cost Lot preserves one item identity, optional UID, quantity, source line, and acquisition order. Single-item paid basis is allocated only when unambiguous, while multi-item consideration, non-cash rewards, and conversion output basis remain deferred or unknown. Original quantity and source facts are immutable; remaining equals original and consumed equals zero throughout Sprint 12. Future FIFO should be represented through separate append-only consumption evidence rather than destructive changes to original acquisition facts.

Migration 009 implements that append-only FIFO boundary. `FifoService` consumes Cost Lot v1 as acquisition supply and only verified paid-disposal Ledger v1 lines as demand. It persists immutable demand and consumption allocation facts while derived lot remaining quantity is calculated without changing Cost Lots. Matching is deterministic per item: disposal timestamp/canonical event/transaction/line order is matched against acquisition sequence, later acquisitions are causally ineligible, UID evidence requires exact identity, and UID-less demand never guesses among UID-bearing supply. Known basis uses cumulative integer allocation; deferred or unknown basis stays null. The layer does not post COGS, calculate gain/loss, value inventory, or affect current user-facing FIFO.

Migration 010 adds Inventory Position v1 as a cached aggregate over Cost Lot v1 and FIFO v1 only. A fungible identity is item ID; a UID-bearing identity is item ID plus UID, so specific equipment is never merged. The rebuild pages lots once, loads indexed consumption totals for each bounded page, derives OPEN/PARTIAL/CLOSED lot state, and aggregates original/consumed/remaining quantity and safely known basis. Deferred allocation, unknown basis, UID ambiguity, and historical shortfalls remain separate confidence inputs. Position status describes the accounting state; health describes reconciliation safety; confidence is a documented 0-100 accounting-evidence score. Position rows are disposable, versioned, deterministic, and non-authoritative. Their deletion cannot lose evidence, and no rebuild updates Cost Lots, FIFO Consumptions, Ledger, Projection, Canonical Events, Raw Logs, or current inventory.

The normative Position status, health, confidence, explanation, and diagnostic semantics are defined in [INVENTORY_POSITION_CLASSIFICATION.md](INVENTORY_POSITION_CLASSIFICATION.md). Classification metadata may be calibrated without changing accounting results; any semantic change must update that matrix in the same change.

`ParserRegistry` is the parser boundary for new raw-log interpretation. The initial verified Wallet and Blood Bag parsers normalize item/cash movements into broad `conversion` events. Unknown logs become durable `unsupported` states; malformed parser output becomes an `error` state. `ReplayService` reads archived raw logs chronologically and upserts deterministic event IDs (`source log + parser + version + output index`), allowing safe repeated replay and future parser-version upgrades. Existing LocalStorage purchase/conversion accounting does not consume canonical events during this sprint.

Core inventory coverage adds City Shop, Bazaar, Item Market, observed trade lifecycle, crime item/cash reward, Faction item receive, and City item find parsers. They report observable generic movements only. In particular, observed trade initiation/offer/expiry data does not establish a completed trade, so it is recorded as transfer/activity evidence rather than an acquisition or disposal. Coverage diagnostics group imported log types by title, payload-field signature, first/last seen time, count, selected parser/version, and Supported/Partially Supported/Unsupported status. This percentage is strictly coverage of imported archive data, not Torn-wide coverage.

Legacy Bazaar purchase (`1220`) and Abroad purchase (`4201`) extend the configured canonical purchase parser rather than adding a separate accounting path. Their verified scalar payloads require item, quantity, unit cost, and total cost; invalid or materially inconsistent records are unsupported. `1220` adds an optional seller participant, while `4201` keeps numeric `area` in generic location attributes. Both parser definitions currently report partial coverage because the representative export does not establish every archived payload signature. They create only generic canonical acquisition movements and remain disconnected from LocalStorage accounting.

Legacy Item Market purchase (`1103`) uses its own strict parser because its archived `item` value is an item-row array and its `cost` field has no separately verified multi-unit allocation semantics. The only accepted contract is `cost,item,seller` with one explicit positive-quantity row whose quantity is exactly one. This makes `cost` both the verified transaction total and the unit cost without derivation. `LegacyItemMarketProfileService` pages all local 1103 raw rows and aggregates field/nested-shape, UID, duplicate, seller, cost, acceptance, and rejection metrics for Coverage Intelligence; it never exports raw rows or personal identifiers. Any multi-row, multi-unit, malformed, duplicate, or otherwise ambiguous variation becomes an unsupported processing result rather than a partial canonical event.

The Item Conversion parser factory follows the same derived-event boundary. It normalizes verified item resources into `out` input and `in` item/cash output movements, rejecting unsupported structures, invalid quantities, duplicate outputs, and invalid cash. The initial configurations cover 2350, 2360, and 2407 only; no item IDs, values, or accounting assumptions are embedded in the generic framework. These configurations remain partial while full archive signature counts are unavailable.

The Cash Sale parser factory provides the matching disposal boundary: verified item resources become `out` sold movements and verified gross proceeds become one `in` cash movement. It does not calculate net proceeds, fees, profit, or basis. Configurations preserve only verified source fields and participants; 1104, 1113, 1221, 1226, and 4210 are partial parser coverage because the representative export cannot prove all archived signatures. They remain derived canonical evidence, disconnected from all active accounting paths.

The player-item movement boundary accepts three verified `data` signatures: 4101 `item,message,quantity,sender`; 4102 `items,message,receiver`; and 4103 `items,message,sender`. Confirmed 4101/4103 receipts emit `gift_received` with item-in movements and known zero cash basis; 4102 sends remain neutral item-out transfers. The known sender or receiver and optional item UIDs are preserved. Unknown signatures and invalid structures become unsupported processing states.

Name-based Torn identifiers pass through `ItemResolutionService.resolveItemId({ source, identifier })` before entering canonical accounting. The resolver is pure, deterministic, and source-scoped; unknown values fail visibly. It is intentionally independent from the asynchronous Item Catalog, which remains display enrichment rather than accounting evidence.

### Torn log type catalog and coverage intelligence

`Torn logtypes endpoint -> LogTypeCatalogService -> LogTypeCatalogRepository -> SQLite torn_log_types` joins separately with `raw_logs -> ParserRegistry` for diagnostics. Migration 004 stores current ID/title reference data and keeps non-destructive change history for new IDs, title changes, and entries no longer returned by Torn; missing entries are inactive, never deleted. The catalog is refreshable only through `js/api.js` and the shared request queue.

Catalog titles are reference data, not parser or accounting instructions. A small explicit classification map records manual relevance decisions. Coverage states distinguish Supported, Partially Supported, Unsupported Observed, Awaiting Sample, Ignored, Legacy, and Parser Error; they are based on observed payload variants in the local archive. This service does not write raw logs, canonical events, acquisitions, lots, conversions, or cost-basis results.

### Coverage intelligence and Project Health

`raw_logs + ParserRegistry + canonical event summaries + import diagnostics -> CoverageIntelligenceService -> Settings dashboard / compact coverage snapshots`

Coverage Intelligence is a read-only aggregation layer. An observed type is a distinct log type with archived records; observed records are individual raw rows; observed signatures are distinct sorted top-level `data` field sets. Fully supported, partial, and unsupported values remain separate. Parser families are optional parser metadata, allowing future parser families to participate without a dashboard-specific mapping. Snapshot migration 005 stores aggregate metrics and replay result fields only after successful replay; it never copies raw evidence or canonical payloads. Health warnings are condition-based rather than threshold-based: conflicts, failed/paused imports, parser errors, unsupported signatures, and supported-record regression are visible warnings.

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

## SQLite-backed Purchases

`Inventory Position v1 -> PurchasesQueryService -> PurchasePositionDetails -> Purchases / ItemDetails`

The query service is an application read model, not another accounting projection. It validates Position/Cost Lot/FIFO version compatibility, performs bounded indexed reads, derives remaining lot state only from persisted original quantities and FIFO sums, and never writes or rematches accounting evidence. Views contain no SQL.

Each selector row is one fungible or UID-specific Inventory Position. UID positions are never merged. Item-level unmatched evidence is returned separately and is not copied onto a UID. Catalog names enrich display only, with deterministic `Item #ID` fallback. ItemStore supplies only the separately labelled current Torn quantity comparison; it never changes the accounting position.

Known remaining basis is the attributable portion of remaining lots. Complete remaining basis is non-null only when no remaining quantity is deferred or unknown. Valid no-cash lots contribute a known zero. Lowest and highest unit basis compare remaining-lot basis ratios; weighted average is `known remaining basis / known remaining quantity`, not an average of lot averages. Trace data retains Position, Cost Lot, Ledger transaction, Projection, Canonical Event, and FIFO Consumption identifiers.

The legacy `PurchaseStore -> CostBasisService` newest-first estimate is retired from Purchases and its Item Details tab. Shared legacy state remains temporarily for Conversion History, StatusBar, and Settings cache compatibility; see [Purchases compatibility](PURCHASES_COMPATIBILITY.md).

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
