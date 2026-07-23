# Roadmap

## Completed foundations
- Modular application shell, router, API queue, and local storage.
- Item inventory cache and reusable DataGrid.
- OwnedItem collection and importers for Inventory, Bazaar, Display Case, and Item Market.
- Desktop ItemDetails, status bar, and synchronization status/summary panels.
- Historical SnapshotService and HistoryStore foundations.
- Purchase-log ingestion with canonical acquisitions, account-scoped persistence, and incremental checkpoints.
- Global Torn item catalog for reference-data lookups across owned and historical items.
- Current-holdings cost-basis estimates with reverse-chronological lot matching and transparent coverage reporting.
- Local purchase-history search and stable selected-row behavior in DataGrid.
- In-app tester documentation sourced from the root README.
- Persisted, accessible collapsible desktop sidebar navigation.
- Known cash cost-basis classifications for paid, zero-cost, non-cash, and unresolved acquisition lots.
- Base-item aggregation for uniquely-instanced equipment across all owned locations.
- FIFO cost-lot ledger, verified inventory conversion history, and current-item market valuation.

## Synchronization enhancements
- Shared ordered Torn API scheduling at a conservative 1,200 ms start interval, with bounded rate-limit backoff and persisted refresh summaries in ItemSyncService.
- SQLite migration foundation: official WASM/OPFS worker, schema migrations, repository contracts, diagnostics, and LocalStorage-compatible staged cutover.
- SQLite raw-log warehouse: immutable raw Torn evidence, resumable historical/incremental archive imports, conflict diagnostics, and parser/replay contracts while LocalStorage accounting remains active.
- Canonical event framework: versioned parser registry, generic movement envelope, deterministic replay, processing diagnostics, and initial Wallet/Blood Bag parsers without accounting migration.
- Temporary developer raw-log JSONL export: read-only filtered/sampled local downloads with redaction and a confirmed full-raw mode; formal backup/restore remains future work.
- Core inventory canonical coverage: verified observed purchase/reward/find and conservative trade-offer parsers, fixture library, payload signatures, and imported-data coverage diagnostics.
- Torn Log Type Catalog & Coverage Intelligence: persisted official ID/title reference data, non-destructive catalog diffs, manual relevance metadata, and a catalog/observed/parser coverage roadmap.
- Read-only Accounting Projection foundation: versioned, deterministic canonical-event interpretation, separate SQLite persistence, rebuild diagnostics, reconciliation, neutral transfer handling, and unresolved trade deferral.
- Read-only Accounting Ledger foundation: controlled accounts, modular policies, balanced deterministic cash postings, separate transaction/line/run persistence, rebuild reconciliation, deferred allocation visibility, neutral transfers, and unresolved trade records.
- Read-only Cost Lot foundation: deterministic source dispositions, shared lot groups, child acquisition lots, deferred basis preservation, UID-safe ordering, separate SQLite persistence, and quantity/basis reconciliation without consumption.
- Read-only FIFO Consumption Engine: immutable paid-disposal demands and allocation records, causal fungible/UID matching, partial and multi-lot consumption, cumulative integer basis handling, derived lot states, historical-shortfall diagnostics, and independent reconciliation.
- Read-only Inventory Position Projection: deterministic fungible/UID identities aggregated from Cost Lot and FIFO evidence, remaining quantity and known/deferred/unknown basis, confidence/status/health, reconciliation, bounded inspection, and application-facing queries.
- Inventory Position RC1 semantic calibration: normative status/health/confidence matrix, structured explanations, proportional evidence deductions, and Project Health quality histograms without accounting changes.
- SQLite-backed Purchases replacement: Inventory Position selector, immutable Cost Lot/FIFO details, controlled basis statistics, UID-safe identity, traceability, and separate current-Torn-quantity comparison.
- Evidence-backed acquisition expansion: the revised archived target set has 18 acquisition-bearing IDs, all with exact raw contracts and explicit zero-cash or unknown-basis supply. Incoming trades and Halloween treats are excluded from acquisition coverage.
- Reusable Item Resolution: deterministic source-specific identifiers can resolve to canonical Torn item IDs without coupling raw parsers to lookup tables or the display-only Item Catalog.
- Accounting semantics v2: superseded canonical interpretations are transactionally replaced, and Projection, Ledger, Cost Lots, and FIFO rebuild as one isolated current-version chain.

## Future
- Valuation only after Purchases has migrated onto Inventory Position.
- Cost-basis allocation for unresolved trades.
- Per-instance equipment details such as UID, weapon/armor stats, bonuses, and equipped state.
- Purchase history, portfolio growth, and historical reporting views.
- Expand parser coverage only from verified raw-log samples, prioritizing observed accounting-relevant unsupported and partially supported log types.
- Correlate trade lifecycle records before allowing incoming trade items to create Cost Lots or receive allocated consideration.
