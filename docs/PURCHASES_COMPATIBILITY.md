# Purchases SQLite Cutover Compatibility

## Application behavior

| Concern | Status | Legacy behavior | Sprint 15 behavior |
|---|---|---|---|
| Item selection | IMPROVED | Acquisition row | Fungible or UID-specific remaining position |
| Current quantity | IMPROVED | Drove the estimate | Separate informational comparison |
| Purchase records | IMPROVED | Acquisition rows | Cost Lots and FIFO consumptions |
| Lowest/highest/average cost | IMPROVED | Newest-first estimate | Exact remaining known-basis lot facts |
| Search | IMPROVED | Source/name/counterparty/date identifiers | Catalog name, item ID, or UID |
| Sorting | PRESERVED | DataGrid sort preference | DataGrid sort preference on position/lot facts |
| Refresh behavior | INTENTIONALLY REMOVED | Torn purchase-log synchronization | Read-only SQLite query refresh; archive/rebuild lives in Settings |
| Loading state | IMPROVED | Sync message | Database, selector, and detail loading states |
| Empty state | IMPROVED | No acquisitions | Missing build, no positions, no lots, and no selection are distinct |
| Error state | IMPROVED | Import error | Controlled SQLite/readiness/detail errors |
| Mobile behavior | PRESERVED | Horizontally bounded grids | Responsive controls and bounded grid scrolling |
| Desktop behavior | IMPROVED | One acquisition grid | Position selector plus detailed facts and histories |
| Accounting source | IMPROVED | LocalStorage acquisitions and legacy lots | SQLite Inventory Position v1, Cost Lot v1, FIFO v1 |
| Traceability | IMPROVED | Acquisition ID | Position, lot, ledger, projection, canonical event, and consumption IDs |

## LocalStorage classification

- `tct.purchases.records`: obsolete as a Purchases accounting source; no longer read by Purchases or Item Details.
- `tct.purchases.syncState`: compatibility status/cache metadata; retained for consumers not migrated in Sprint 15.
- legacy inventory-ledger lots: not read by Purchases; retained temporarily for Conversion History compatibility.
- `tct.items*`: allowed only for the separately labelled current Torn quantity comparison.
- `tct.itemCatalog`: display-only name enrichment; never an accounting input.
- `tct.grid.purchases.*`: UI sort preferences only.

No legacy cache was broadly deleted. Conversion History, StatusBar, and Settings cache controls require separate migration review.
