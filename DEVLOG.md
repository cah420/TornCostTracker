# Development Log

## Accounting Specification Update

Logs 4101 and 4103 are now confirmed gifts rather than neutral transfers. Their separate legacy/current raw contracts emit the explicit canonical `gift_received` type, preserve sender, quantity, and any verified UID evidence, and project to zero-cash reward supply. Log 4102 remains an accounting-neutral outbound item transfer.

Log 5802 identifies its output with Torn's descriptive `virus` value rather than a numeric item ID. The parser extracts that identifier and delegates to the pure Item Resolution service. The resolver owns the source-specific translation to canonical IDs: Simple 69, Polymorphic 70, Tunneling 71, Armored 72, Stealth 73, and Firewalk 103. Unknown sources or identifiers throw controlled resolution errors; the parser converts those into visible unsupported variants and emits no item movement.

The resolver is separate from `ItemCatalogStore`. The catalog is asynchronous, local display enrichment and may be absent during deterministic replay; Item Resolution is a small version-controlled semantic registry required to interpret raw evidence. Future name/code-based raw contracts can add independent source tables behind the same `resolveItemId({ source, identifier })` API.

Logs 2536 and 4446 are excluded from acquisition coverage. Halloween treats do not add inventory. Incoming trade items remain correlation evidence represented with non-inventory `transfer` evidence movements inside an unresolved activity; they cannot independently create inventory supply. Canonical persistence now removes any rebuildable projection that references a superseded event before replacing that event and its processing state in one transaction. Raw logs remain immutable.

Because these changes alter physical supply and basis semantics, Accounting Projection, Ledger, Cost Lot, and FIFO constants advance together to version 2. The new chain is rebuilt in dependency order after canonical replay, leaving prior derived versions isolated for diagnosis instead of mixing them into current Purchases or Inventory Position results.

## FIFO Rebuild Natural-Key Replacement Fix

Acquisition coverage can legitimately change the available Cost Lot supply while existing disposal demands remain stable. A recomputed match may therefore retain the same FIFO database natural key—version, demand, source lot, and match sequence—but receive a different deterministic ID because its consumed quantity changed. The previous `ON CONFLICT(id)` persistence path could not replace that row and SQLite raised a unique-constraint error.

FIFO rebuild now treats consumptions as an item-scoped derived replacement set. Before persisting an item's newly computed matches, the repository captures the prior deterministic IDs and deletes only that FIFO version/item's consumption rows. The rebuilt rows are then inserted in bounded batches. Unchanged IDs continue to count as existing for idempotency diagnostics; changed matches receive new IDs; stale matches disappear. A failed run remains visibly unhealthy and a retry reconstructs the affected item from immutable Cost Lots and disposal demands.

The first version-2 browser rebuild also exposed a version ownership leak in Cost Lot policies: disposition-only results embedded version 1 while lot-producing results used the central version 2 constant. The run could finish processing but failed stored-disposition reconciliation, so FIFO rejected it as an unreconciled prerequisite. Disposition identity and version now come exclusively from the Cost Lot model helper.

## Acquisition Coverage Sprint

The redacted archive established one observed payload signature for each of 20 target IDs. Eighteen new exact-ID adapters were added. Similar legacy/current titles still dispatch independently. The later Accounting Specification Update reclassified 4101/4103 as gifts, 5802 as resolved supply, and 2536/4446 as outside acquisition coverage.

Fifteen IDs now create accounting supply. Dump finds and verified seasonal pickups are explicit zero-cash rewards. Keepsake, job/company special, mission-credit, and Christmas-buck purchases are `non_cash_acquisition` events whose resource consideration is preserved as metadata but is not converted into Torn-dollar basis. Referral, stock, subscription, faction payout, wheel, and Christmas Town rewards create lots with unknown basis. This prevents both lost quantity and invented zero-dollar costs.

Trade items incoming (4446) preserves correlation evidence but creates no inventory movement or Cost Lots. The superseding specification confirms 4101/4103 as zero-cash gifts and resolves 5802 virus names through the Item Resolution service. Halloween treat receipt (2536) remains non-inventory activity.

The downstream policy boundary now distinguishes explicit zero-cash rewards from rewards with unknown basis. Resource-funded acquisitions have their own projection and ledger policy and generate deferred unknown-basis lots. Deterministic identities continue to derive from source log, parser name/version, ledger source, and line occurrence; replay and rebuild therefore upsert the same facts.

## Sprint 15 - SQLite-Backed Purchases Replacement

Purchases now consumes Inventory Position v1 through `PurchasesQueryService`; detailed rows are reconstructed read-only from immutable Cost Lots and FIFO consumptions. The query layer is not another accounting projection and never rematches lots, writes source data, or fills missing basis.

The legacy route used `PurchaseSyncService -> PurchaseStore -> CostBasisService` and exposed acquisition rows, initial/incremental sync controls, and a newest-first holdings estimate. The replacement exposes remaining fungible/UID accounting positions, exact lot state, FIFO history, trace IDs, and controlled basis completeness. Current ItemStore quantity remains a separate informational comparison. Item-catalog names are display enrichment only.

Compatibility audit: `tct.purchases.records` is obsolete as a Purchases accounting source; `tct.purchases.syncState` and legacy acquisition data remain temporarily shared by StatusBar, Settings cache management, and Conversion History. They were not broadly deleted. DataGrid sort keys remain UI preferences. See `docs/PURCHASES_COMPATIBILITY.md`.

## Sprint 14 RC1 - Inventory Position Quality Calibration

The first live Inventory Position rebuild proved the projection architecture—46,601 Positions over 97,199 Cost Lots and 8,547 FIFO Consumptions, with every reconciliation balanced and no diagnostics—but exposed semantic inflation: 46,138 rows were labeled UNKNOWN and 46,139 WARNING. The accounting values were sound. The initial classifier had used UNKNOWN for unknown basis and historical evidence, then propagated UID-less item warnings to every UID identity for that item.

RC1 separates those dimensions. UNKNOWN is reserved for an explicitly indeterminate remaining quantity. Deferred or unknown basis produces DEFERRED because quantity is still known; partial lots remain PARTIAL; attributable historical shortfall and UID evidence lower confidence and produce WARNING without replacing the inventory status. UID-less evidence that cannot be assigned to a fungible Position is reported as unassigned Project Health evidence rather than attached to tens of thousands of specific UIDs.

Confidence deductions are now proportional and bounded: deferred basis 1–15, unknown basis 1–25, historical shortfall 1–15, exact UID ambiguity 10, indeterminate quantity 40, and integrity failure 100. Every Position carries a structured explanation, and rebuild metrics persist detailed confidence/deduction/reason histograms. The authoritative matrix is `docs/INVENTORY_POSITION_CLASSIFICATION.md`. None of these semantic fields participates in Position quantity, basis, identity, source, persistence, or reconciliation math.

## Sprint 14 - Inventory Position Projection Foundation (Part 1)

Inventory Position v1 extends the discardable derived pipeline as `Immutable Cost Lots + Immutable FIFO Consumptions -> Inventory Position Projection -> Future SQLite-backed Purchases`. Migration 010 stores one deterministic row per fungible item ID or specific item UID, along with rebuild runs and controlled diagnostics. The service pages Cost Lots through their version/time index, requests FIFO totals only for each bounded lot page, aggregates positions in one pass, and persists in batches. Rebuilds update identical IDs, prune stale rows only after a complete replacement has been written, and never update either source layer.

Each lot's current state is derived as original minus consumed: unchanged lots are OPEN, partly depleted lots are PARTIAL, and zero-remaining lots are CLOSED. Known allocated and confirmed no-cash lots contribute known remaining basis; shared deferred allocation and unknown basis remain distinct and nullable. A position-wide basis is null whenever part of that position is not safely allocatable, while `knownBasis` still exposes the known subset without representing the unknown part as zero.

Confidence is accounting confidence, not correctness. It begins at 100 and deterministically deducts a quantity-weighted 30 points for deferred remaining basis, a quantity-weighted 50 points for unknown remaining basis, 15 for an observed historical FIFO shortfall, and 20 for unresolved UID evidence; projection errors force zero. NORMAL/PARTIAL positions with reconciled known basis can remain HEALTHY, deferred or uncertain positions are WARNING, and impossible quantities, basis, identities, or source references are UNHEALTHY. The initial name is the deterministic `Item #ID` fallback because versioned Cost Lot/FIFO inputs do not contain catalog names; a future SQLite reference-data join may enrich display names without changing identity or accounting.

## Sprint 13 - Read-Only FIFO Consumption Engine

FIFO v1 is an independent, discardable allocation layer over immutable Cost Lot v1 supply and Accounting Ledger v1 paid-disposal demand. Migration 009 stores deterministic disposal-demand rows, append-only consumption records, one source disposition per examined ledger transaction, bounded diagnostics, and rebuild runs. Cost Lot rows are never updated: derived remaining quantity is always `original quantity - persisted FIFO consumption quantity`.

The rebuild scans Ledger transactions in stable chronological order, persists valid paid-disposal item-out occurrences, then processes independent item queues in deterministic disposal and acquisition order. A disposal cannot consume a later acquisition. Fungible demand consumes the oldest UID-less eligible lots; exact outgoing UID evidence selects only the matching UID lot. A UID-less disposal is left unresolved when historically eligible UID-bearing supply would require guessing identity. Partial matches are retained with explicit historical shortfalls, and conversion inputs, transfers, trades, cash activity, and unsupported disposal semantics remain outside matching.

The initial live rebuild exposed a diagnostics performance boundary: the recent-lot inspection grouped the complete Cost Lot table before applying its UI limit. The inspection now selects its bounded recent-lot window through the Cost Lot version/time index first and performs indexed consumption totals only for those displayed rows. Starting a new rebuild also closes any prior same-version run left `running` by a browser refresh as an explicitly interrupted failed run before recording the replacement run.

Known lot basis is consumed using cumulative integer allocation: `floor(total basis * cumulative quantity / original quantity)`. Each slice receives the difference between cumulative values before and after the slice, so partial consumption never overallocates and full consumption exactly equals the lot basis without floating-point rounding. Unknown, deferred, and known-no-cash-consideration lots can supply physical quantity while consumed basis remains null. The Settings and Project Health panels expose separate source, demand, match, lot, item, basis, and ordering reconciliations; no COGS, gain/loss, valuation, authoritative inventory, or current application calculation consumes this layer.

## Sprint 12 - Read-Only Cost Lot Foundation

Cost Lot v1 extends the derived pipeline as `Raw Log -> Canonical Event -> Accounting Projection -> Accounting Ledger -> Cost Lot Foundation -> Future FIFO Consumption -> Future Inventory Position -> Future Valuation`. Migration 008 persists one source disposition for every examined ledger transaction plus deterministic lot groups, child cost lots, and rebuild-run metrics. The service pages ledger transaction payloads in stable timestamp/transaction-ID order and never reads or modifies projections, canonical events, raw logs, Purchases, inventory, or the current LocalStorage accounting path.

The ordered Cost Lot policy registry creates fully allocated groups for unambiguous single-item paid acquisitions, shared deferred groups for multi-item purchases, unknown/no-cash-basis deferred groups for non-cash rewards, and deferred output groups for conversions with item-in lines. Paid disposals, cash rewards, wallet movements, neutral transfers, unresolved trades, and cash-only conversions receive explicit non-lot dispositions. Each lot preserves its ledger line, item ID, optional UID, original quantity, full remaining quantity, zero consumed quantity, and deterministic acquisition sequence (`timestamp -> canonical event ID -> ledger transaction ID -> occurrence -> lot ID`). Indivisible unit basis remains null while total basis stays known. Future consumption should use separate append-only records rather than rewriting original acquisition facts.

Run reconciliation proves one disposition per source transaction, source item-in quantity equals original and remaining lot quantity, consumed quantity remains zero, and known group basis equals allocated plus unallocated basis. The Settings panel and Project Health expose health, coverage, reasons, UID counts, throughput, and limited trace chains. FIFO, lot depletion, disposal matching, COGS, gain/loss, valuation, and authoritative inventory remain outside Sprint 12.

## Sprint 11.1 - Read-Only Accounting Ledger Foundation

Accounting Ledger is a second, independent derived SQLite layer: `Raw Log -> Canonical Event -> Accounting Projection -> Accounting Ledger -> Future Cost Lots / FIFO -> Future Valuation`. Ledger v1 reads stored projection records in bounded pages only. It never reads raw payloads, changes canonical/projection rows, or becomes authoritative for Purchases, inventory, FIFO, existing LocalStorage lots, valuation, or profit/loss.

The controlled account catalog and ordered policy registry produce one deterministic transaction per projection (`ledger version + projection ID + policy code`) and deterministic line IDs. Posted cash transactions use integer double-entry lines and must balance individually; global posted debits and credits are reconciled after each rebuild. Multi-item consideration remains transaction-level and allocation-deferred, non-cash rewards preserve quantity without invented value, conversions preserve all observed sides without basis allocation, transfers are memorandum-only, and trades remain unresolved with `trade_correlation_required`. Rebuilding the same ledger version upserts the same records instead of duplicating them. The Settings ledger panel and Project Health report the run, storage, balance, reconciliation, deferred, and unresolved diagnostics.

## Sprint 11 - Read-Only Accounting Projection Foundation

Accounting Projection is a rebuildable SQLite-derived interpretation layer between canonical events and future ledger work: `Raw Log → Canonical Event → Accounting Projection → Future Ledger → Future Cost Lots / FIFO`. Projection rows are deterministic (`projection version + canonical event ID`), persisted separately, and never modify raw logs, canonical events, LocalStorage purchases, inventory, FIFO, cost lots, or valuation.

Version 1 classifies verified paid acquisitions/disposals and structurally complete conversions as projectable; item rewards as non-cash rewards; cash-only rewards separately; ordinary transfers as neutral; and all current trade-parser events as explicitly unresolved with `trade_correlation_required`. Projection errors remain visible and retain a reason. Unknown basis, deferred allocation, and known no-cash consideration are distinct states; no value is invented. Rebuilds page canonical records, upsert deterministic rows, track existing rows on a second pass, and reconcile every examined event to exactly one outcome.

## Sprint 10.10 - Legacy Item Market Purchase Coverage

Legacy Item Market buy (`1103`) now has a deliberately narrow canonical acquisition contract based on the supplied historical shape: top-level `cost,item,seller`, an explicit non-empty `item` array containing exactly one positive-quantity row, and a valid seller. The parser accepts quantity one only. In that restricted shape, `cost` is safely recorded as total transaction consideration and, because there is exactly one unit, also as unit cost. The item becomes an `in` movement, cash becomes an `out` movement, and an item UID is preserved where supplied.

`LegacyItemMarketProfileService` scans the complete local 1103 population in bounded SQLite pages and returns aggregate-only diagnostics: timestamps, field/nested-row signatures, row counts, quantity/UID/duplicate conditions, seller and cost shapes, malformed structures, parser acceptance, and grouped rejection reasons. It intentionally exposes no raw identities or item values. Multi-row or quantity-greater-than-one records are rejected rather than receiving a guessed allocation of `cost`; the live Project Health refresh reports the exact accepted/rejected result for the current archive. No current accounting path consumes these events.

## Sprint 10.9 - Canonical Transfer Events

The canonical event layer now has a strict reusable Transfer parser factory for objective player-to-player item movement. The verified archive signatures are: `4101 Item receive (legacy)` with `item,message,quantity,sender`; `4102 Item send` with `items,message,receiver`; and `4103 Item receive` with `items,message,sender`. The legacy receive shape is a positive scalar item plus quantity, current receives are numeric item-to-quantity maps, and sends are explicit item-line arrays with optional UIDs.

Each valid source record emits one generic `transfer` event. Its item movements are `in` for receives and `out` for sends, relative to the logged-in account; the raw sender or receiver becomes the sole known counterparty. The parser deliberately does not fabricate the absent local participant, retain private messages, add a cash movement, or make any acquisition, disposal, trade, valuation, FIFO, or accounting inference. Unknown field signatures, malformed parties/items/quantities, duplicate item lines, and unverified structures remain durable unsupported replay results. Because Transfer is parser metadata, Project Health and Coverage Intelligence include its counts automatically.

## Sprint 10.8.5 - Coverage Intelligence

Coverage diagnostics are now a dedicated read-only intelligence layer. It aggregates observed raw-log types, records, top-level payload signatures, parser status, registered parser family metadata, canonical-event totals, import health, and the highest-impact non-fully-supported types. Supported record/signature totals include fully and partially parsed observations; fully supported values remain separate so partial coverage is never presented as complete.

Successful canonical replay records one compact `coverage_snapshots` row containing only aggregate metrics and replay result fields—never raw logs or canonical payloads. Project Health derives warnings only from meaningful conditions such as archive conflicts, failed/paused imports, parser errors, unsupported signatures, or supported-record regression against the prior snapshot. The Settings developer panel and raw JSONL export consume these diagnostics without changing replay output or accounting.

## Sprint 10.8 - Canonical Cash-Sale Events

Canonical disposal support now has its own strict, configured cash-sale factory rather than reversing purchase logic. Each verified record produces one `disposal` event with item `out` and cash `in` movements. The factory requires positive item quantities, nonnegative finite proceeds, valid required buyers, and consistent unit/total values whenever both are usable. It preserves a verified item UID in movement attributes, a buyer participant when the source supplies one, and configured source fields without using them to derive net proceeds, fees, or profit.

The first partial configurations are 1104 legacy Item Market sell, 1113 Item Market sell, 1221 legacy Bazaar sell, 1226 Bazaar sell, and 4210 Item Shop sell. `1104` is intentionally limited to the verified one-unit `cost` shape, so `cost` is treated as total proceeds only for that shape. `1113` preserves `cost_total` while its observed nullable `cost_each` remains null rather than being invented. 1221, 1226, and 4210 verify the explicit unit-price × quantity = total-proceeds relation. All five remain partial because representative exports do not establish every archived signature. No accounting path consumes these events.

## Sprint 10.7 - Verified Item Conversion Framework

Canonical conversion parsing now has a reusable strict factory instead of three mechanic-specific event builders. It accepts only verified scalar item IDs, arrays with explicit item quantities, or numeric quantity object maps; preserves a supplied UID in movement attributes when present; rejects malformed values and duplicate item outputs; and constructs one generic `conversion` event with `out` input and `in` output movements. Cash is represented by the existing generic cash movement model, never as profit or cost basis.

The first configurations cover `2350` Item use box of grenades, `2360` Item use box of medical supplies, and `2407` Item use stash box. The box shapes require one scalar input item, one explicit-quantity `item2` output, and a matching declared `quantity`; the stash-box shape requires one scalar input item and nonnegative `money` output. All three remain partial coverage because representative exports cannot prove complete archive-signature coverage. Raw evidence, replay infrastructure, and every accounting path remain unchanged.

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
