# FIFO Rebuild Natural-Key Replacement Fix
- Fixed FIFO rebuild failures when changed upstream Cost Lot quantities produced a revised consumption ID for an existing demand/lot/match-sequence natural key.
- FIFO now replaces the complete derived consumption set for each processed item before storing its recomputed matches, removing stale allocations without clearing Cost Lots, Ledger records, demands, or other items.
- Preserved deterministic replay metrics: unchanged consumption identities remain existing records, while materially changed allocations receive their new deterministic identities.
- Fixed the Cost Lot v2 prerequisite failure caused by disposition-only policies still persisting version-1 identities. All Cost Lot outputs now receive their version from the central Cost Lot model.

# Accounting Specification Update
- Removed 2536 Halloween treat receipts and 4446 incoming trade-item evidence from acquisition coverage; neither directly changes owned inventory or creates Cost Lots.
- Reclassified 4101/4103 item receipts as confirmed `gift_received` events with preserved quantities and known zero cash basis.
- Added reusable Item Resolution infrastructure and fully supported 5802 programmed-virus acquisitions for Simple (69), Polymorphic (70), Tunneling (71), Armored (72), Stealth (73), and Firewalk (103) Viruses.
- Added canonical replay replacement of superseded parser outputs so revised gift, trade-evidence, and virus semantics cannot coexist with stale derived events.
- Advanced Accounting Projection, Ledger, Cost Lot, and FIFO derivations to version 2 so the reclassified canonical history rebuilds into an isolated accounting chain without retaining version-1 semantics.

# Acquisition Coverage Sprint
- Added exact-ID, evidence-backed canonical coverage for 18 previously unsupported archived contracts.
- Added new supply for verified Dump/seasonal finds, resource-funded purchases, and reward variants. Confirmed zero-cash finds receive zero basis; non-cash consideration and unpriced rewards retain unknown basis.
- Added non-inventory activity/trade-evidence parsing for 2536/4446 and subsequently refined 4101/4103/5802 through the Accounting Specification Update above.
- Extended Accounting Projection, Ledger, Cost Lots, coverage classifications, fixtures, and deterministic pipeline tests without changing transfer neutrality or inventory reconciliation boundaries.

# v0.10.0-alpha1 — Sprint 15 SQLite-Backed Purchases Replacement
- Replaced the Purchases accounting source with Inventory Position v1, immutable Cost Lots v1, and FIFO v1 consumption facts queried from SQLite.
- Added a read-only `PurchasePositionDetails` model and indexed query service with search, filters, paging, UID isolation, request-race protection, and trace references.
- Added exact remaining-lot quantity/basis statistics, controlled known-versus-complete basis semantics, and an informational current Torn quantity comparison.
- Retired LocalStorage purchase accounting reads from Purchases and the Item Details Purchases tab; shared compatibility stores remain for consumers not migrated in this sprint.
- Added Purchases consumer metrics to Project Health, deterministic tests, responsive states, and migration documentation. Valuation remains deferred.

# Sprint 14 RC1 - Inventory Position Quality Calibration
- Calibrated Position semantics without changing identity, quantity, basis, persistence, source versions, or reconciliation: `UNKNOWN` now means indeterminate remaining quantity, while incomplete basis is `DEFERRED` and attributable historical/UID limitations preserve the inventory status.
- Rebalanced deterministic confidence deductions, stopped propagating UID-less evidence to every UID Position, and added structured human-readable explanations with status, health, confidence, warnings, reasons, and supporting context.
- Added detailed confidence, warning, status, UNKNOWN-combination, deduction, and unassigned-evidence histograms to Settings and Project Health, plus a normative Position Classification Matrix.

# Sprint 14 - Inventory Position Projection Foundation (Part 1)
- Added SQLite migration 010 and independently versioned Inventory Position v1 rows, diagnostics, and rebuild runs derived only from immutable Cost Lot v1 and FIFO v1 records.
- Added deterministic fungible item-ID and UID-specific identities, derived open/partial/closed lot aggregation, known/deferred/unknown quantity and basis categories, status, health, confidence deductions, and source/quantity/basis/lot reconciliation.
- Added paged OPFS aggregation, batched idempotent persistence, stale-position pruning, interrupted-run recovery, efficient application-facing queries, bounded Settings inspection, and Project Health reporting without changing current Items, Purchases, valuation, or upstream accounting layers.

# Sprint 13 - Read-Only FIFO Consumption Engine
- Added SQLite migration 009 with immutable disposal demands, FIFO consumption allocations, source dispositions, diagnostics, and rebuild-run metrics over Ledger v1 and Cost Lot v1.
- Added conservative paid-disposal demand policies plus deterministic per-item matching for fungible FIFO, exact UID evidence, partial lots, multi-lot/multi-disposal allocation, causal-time enforcement, and explicit historical shortfalls.
- Added cumulative integer basis allocation without rounding drift, derived lot-state queries without Cost Lot mutation, Settings inspection, Project Health reconciliation, and deterministic second-run idempotency. Current Purchases, inventory, legacy FIFO, valuation, and active accounting remain unchanged.
- Fixed the post-rebuild Settings stall by limiting derived lot-state inspection before calculating consumption totals, and mark browser-interrupted FIFO runs as failed when a replacement rebuild begins.

# Sprint 12 - Read-Only Cost Lot Foundation
- Added SQLite migration 008 with separately versioned lot groups, cost lots, source dispositions, and rebuild runs derived exclusively from Accounting Ledger v1.
- Added modular lot policies for paid acquisitions, non-cash rewards, and conversion outputs. Single-item basis is allocated only when unambiguous; shared purchase basis, reward basis, and conversion basis remain explicitly deferred without invented values.
- Added deterministic acquisition ordering, UID safeguards, quantity/basis/source reconciliation, paged idempotent rebuilds, Project Health metrics, and limited Settings inspection. FIFO consumption, disposal matching, valuation, and active application accounting remain unchanged.

# Sprint 11.1 - Read-Only Accounting Ledger Foundation
- Added SQLite migration 007 and a separate versioned Accounting Ledger (`v1`) with controlled accounts, deterministic transactions/lines, rebuild-run metrics, and indexes for source, status, account, and item inspection.
- Added modular projection-only ledger policies: balanced paid acquisitions/disposals and cash rewards; deferred non-cash rewards and item-only conversions; neutral transfer memoranda; and explicitly unresolved trades. No FIFO, lots, valuation, Purchases, or inventory behavior changed.
- Added Settings rebuild/diagnostics and Project Health ledger reporting, including disposition counts, balance/reconciliation state, deferred/unresolved reasons, controlled account count, and persisted row totals.

# Sprint 11 - Read-Only Accounting Projection Foundation
- Added SQLite migration 006 with deterministic, versioned accounting projections and projection-run metrics separate from canonical events.
- Added a paged rebuild service and validated policy classifications for paid acquisitions/disposals, conversions, wallet movements, rewards, neutral transfers, unresolved trades, and visible projection errors.
- Added Settings developer diagnostics with reconciliation, outcomes, classifications, projection version, and rebuild progress. FIFO, lots, valuation, Purchases, and active accounting remain unchanged.

# Sprint 10.10 - Legacy Item Market Purchase Coverage
- Added strict canonical acquisition support for the verified legacy Item Market buy (1103) contract: `cost,item,seller`, one explicit item row, and quantity one.
- Added browser-side aggregate profiling for all archived 1103 rows, reporting structural, UID, seller, cost, accepted/rejected, and signature coverage without exposing raw participant or item data.
- Preserved 1103 as a generic item-in/cash-out canonical event only; no FIFO, lots, purchase UI, valuation, or accounting behavior was introduced.

# Sprint 10.9 - Canonical Transfer Events
- Added the generic Transfer parser family for verified Item receive (legacy) (4101), Item send (4102), and Item receive (4103) logs.
- Transfer events preserve the verified sender or receiver, item IDs, quantities, and send-item UIDs as generic `in`/`out` movements without creating acquisition, disposal, reward, conversion, cash, FIFO, or accounting records.
- Added strict signature, participant, item-structure, quantity, and duplicate-item validation; unverified variants remain unsupported.

# Sprint 10.5 - Torn Log Type Catalog & Coverage Intelligence
- Added SQLite migration 004 for a durable Torn log-type reference catalog, including active/inactive state and append-only new/renamed/removed change history.
- Added an API-queued Torn `logtypes` refresh plus Settings diagnostics that compare the official catalog, locally observed archive records, and registered parser coverage.
- Added explicit manual classifications and Supported, Partially Supported, Unsupported Observed, Awaiting Sample, Ignored, Legacy, and Parser Error states without changing raw logs, parser replay, or accounting.

# Sprint 10.6 - Legacy Bazaar & Abroad Purchase Canonical Events
- Added verified canonical acquisition parsers for legacy Bazaar buys (1220) and Abroad buys (4201), including item-in, cash-out, unit/total consideration, seller, and generic area metadata where present.
- Added strict scalar-purchase validation for these new parser configurations; malformed, missing, and materially inconsistent consideration variants remain explicit unsupported results.
- Marked both parsers as partial coverage because the representative export cannot prove every archived payload signature is covered.

# Sprint 10.7 - Verified Item Conversion Framework
- Added a reusable strict canonical conversion-parser factory for verified item inputs and item/cash outputs.
- Added partial canonical conversion coverage for grenade boxes (2350), medical-supply boxes (2360), and stash boxes (2407), with input/output movement validation and duplicate-output rejection.
- Kept conversion events descriptive only: no purchase records, lots, FIFO, valuation, or cost-basis behavior changed.

# Sprint 10.8 - Canonical Cash-Sale Events
- Added a reusable strict cash-sale parser family for verified item-out/cash-in canonical disposal events.
- Added partial coverage for legacy/current Item Market sales (1104, 1113), legacy/current Bazaar sales (1221, 1226), and Item Shop sales (4210), preserving verified buyer, UID, unit/total proceeds, and generic source context where present.
- Added no profit, fees, proceeds matching, FIFO, lots, or accounting behavior.

# Sprint 10.8.5 - Coverage Intelligence
- Added read-only archive-level coverage, signature, parser-family, replay-progress, and Project Health diagnostics.
- Added compact SQLite coverage snapshots after successful replay and enriched raw-log export metadata with per-type coverage context without increasing exported examples.
- Kept raw logs, replay semantics, parser output, canonical events, and accounting behavior unchanged.

# Sprint 10.2 - Raw Log Warehouse and Historical Import Foundation
- Added SQLite migration 002 with immutable `raw_logs`, durable import runs, resumable checkpoints, and conflict diagnostics.
- Added a user-triggered Settings archive workflow for historical and incremental raw Torn log imports, with pause, resume, cancel, retry, and local diagnostics.
- Added canonical JSON SHA-256 hashing, duplicate-safe source-log IDs, conflict preservation, batched transactions, and a future parser/replay contract.
- Kept LocalStorage purchases, FIFO, conversions, and cost basis fully authoritative and unchanged.

# Sprint 10.3 - Canonical Event Framework & Parser Infrastructure
- Added migration 003 with generic canonical events and durable versioned processing state.
- Added deterministic parser registry/replay infrastructure and verified Wallet/Blood Bag conversion parsers.
- Added Settings diagnostics and explicit unsupported/parser-error reporting; canonical events remain disconnected from active accounting.

# Temporary Raw Log Developer Export
- Added a local, read-only filtered JSONL export for archived raw logs with deterministic sample controls, parser-state filters, progress, and cancellation.
- Added redacted developer output by default plus a confirmed full-raw option; no application settings or API keys are queried or exported.

# Sprint 10.4 - Core Inventory Event Coverage
- Added verified generic canonical parsers for observed City Shop, Bazaar, Item Market, trade-offer, crime reward, Faction item receive, and City item find payloads.
- Added fixture library, unsupported-variant handling, and imported-data parser coverage diagnostics with payload signatures.
- Kept canonical events and all current LocalStorage accounting paths separate.

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
