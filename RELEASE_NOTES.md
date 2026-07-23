# Torn Cost Tracker v0.10.0-alpha1

Purchases is now a read-only SQLite accounting consumer. It lists Inventory Position v1 rows and opens their immutable Cost Lots and FIFO consumption history without rerunning or changing accounting. Search, status/health/basis/identity filters, paging, UID-safe identities, trace references, and stale-request protection are included.

Known remaining basis and complete remaining basis are deliberately separate. Complete basis is unavailable when any remaining quantity is deferred or unknown; valid zero-cash lots still contribute a known $0 basis. Current Torn quantity is shown only as an informational comparison.

The Purchases route and Item Details Purchases tab no longer use LocalStorage acquisition records or the legacy newest-first estimate. Other compatibility consumers, including Conversion History and status/cache workflows, may still require later migration. Valuation remains deferred, and v1.0.0 remains reserved for full SQLite-backed application parity.

## Previous v0.9.0 foundation

This release establishes the local, event-sourced accounting foundation while preserving the existing user-facing LocalStorage application. Raw evidence, canonical events, Accounting Projection, Accounting Ledger, and the read-only Cost Lot Foundation remain separate and rebuildable. All data remains local to the browser profile running the application; v1.0.0 remains reserved for SQLite-backed feature parity.

## Highlights

- Added immutable raw-log archival, versioned canonical replay, coverage intelligence, Accounting Projection v1, balanced Accounting Ledger v1, and the read-only Cost Lot v1 foundation.
- Added deterministic, idempotent rebuilds and Project Health diagnostics across the derived SQLite pipeline.
- Cost Lot groups preserve shared transaction basis, while child lots retain item identity, UID, quantity, acquisition order, and explicit deferred/unknown basis without inventing values.
- Added a read-only FIFO Consumption layer that matches verified paid disposals against immutable historical Cost Lots without changing active application accounting or original lot facts.
- Added Inventory Position v1, a deterministic read-only aggregate over Cost Lot v1 and FIFO v1 with fungible/UID identities, remaining quantity and basis, confidence/status/health, reconciliation, and Settings/Project Health diagnostics.
- Calibrated Inventory Position quality semantics so UNKNOWN means unknown remaining quantity—not incomplete basis—and added explainable classification plus detailed confidence and warning histograms without changing accounting outputs.

- Shared Torn API scheduling now starts requests no faster than every 1,200 ms, targeting approximately 50 requests per minute with bounded rate-limit backoff.
- Item synchronization identifies the active Inventory category in its status message.
- Purchase history recognizes verified Faction Gift and City Find entries as confirmed $0 cash acquisitions.
- A new FIFO cost-lot ledger tracks verified inventory conversions independently from the existing cost-basis estimator.
- Verified `Item use wallet` and `Item use empty blood bag` logs create auditable conversion records.
- Conversion History shows inputs, outputs, cash, original basis, historical value received, and an informational positive/negative value difference.
- Item Details now shows current market price, vendor sell price, effective value, estimated inventory value, and market refresh time.

## Important notes

- Conversion mappings are intentionally limited to verified Torn log shapes.
- A conversion with missing input acquisition history is retained as unresolved; no $0 basis is fabricated and synchronization continues.
- To reconstruct older conversion history, clear the Purchase Cache in Settings and run a new initial purchase sync. This also clears the dependent conversion ledger.
- Market values are informational except when a verified multi-output conversion snapshots effective values for allocation. They do not continuously rewrite historical cost basis.

Please report missing, duplicated, or incorrectly valued conversions with the relevant Torn log title, log type, and field names—never include an API key.
