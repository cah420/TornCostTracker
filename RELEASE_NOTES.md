# Torn Cost Tracker v0.8.0-alpha1

This alpha release adds a safer, faster acquisition pipeline and the first inventory-conversion accounting foundation. All data remains local to the browser profile running the application.

## Highlights

- Shared Torn API scheduling now starts requests no faster than every 1,200 ms, targeting approximately 50 requests per minute with bounded rate-limit backoff.
- Item synchronization identifies the active Inventory category in its status message.
- Purchase history recognizes verified Faction Gift and City Find entries as confirmed $0 cash acquisitions.
- A new FIFO cost-lot ledger tracks verified inventory conversions independently from the existing cost-basis estimator.
- Verified `Item use wallet` and `Item use empty blood bag` logs create auditable conversion records.
- Conversion History shows inputs, outputs, cash, original basis, historical value received, and an informational positive/negative value difference.
- Item Details now shows current market price, vendor sell price, effective value, estimated inventory value, and market refresh time.

## Important alpha notes

- Conversion mappings are intentionally limited to verified Torn log shapes.
- A conversion with missing input acquisition history is retained as unresolved; no $0 basis is fabricated and synchronization continues.
- To reconstruct older conversion history, clear the Purchase Cache in Settings and run a new initial purchase sync. This also clears the dependent conversion ledger.
- Market values are informational except when a verified multi-output conversion snapshots effective values for allocation. They do not continuously rewrite historical cost basis.

Please report missing, duplicated, or incorrectly valued conversions with the relevant Torn log title, log type, and field names—never include an API key.
