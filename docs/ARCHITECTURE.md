# Architecture

## Owned items

`Torn API -> source importer -> ItemSyncService -> ItemStore -> OwnedItem -> views`

Each `OwnedItem` is the canonical current-holdings record. Its `totalQuantity` is the sum of Inventory, Bazaar, Item Market, and Display Case quantities. Importers alone understand source-specific Torn API response fields.

## Purchase history

`Torn user logs -> PurchaseLogImporter -> PurchaseSyncService -> PurchaseStore -> acquisition views`

`Acquisition` records are normalized and account-scoped. PurchaseStore persists compact transaction and item-line data, not raw Torn log responses. A source importer is responsible for any safe cost allocation; downstream analysis never derives a unit price from a transaction total.

## Current-holdings cost basis

`OwnedItem + PurchaseStore acquisitions -> CostBasisService -> ItemDetails Purchases tab`

CostBasisService is a pure, non-persistent analysis service. It takes matching normalized item lines from supported acquisition sources and consumes them newest first until current `totalQuantity` is covered. A lot may be partially used. Equal timestamps use descending acquisition ID as a deterministic secondary sort, so estimates do not change between runs.

Quantity coverage (`matched/current`) and priced coverage (`reliably priced/current`) remain separate. Unresolved lines, such as a multi-item trade with no safe allocation, can cover quantity but contribute no known cost. This is an estimate: acquisition history may omit gifts, rewards, crimes, sales, transfers, item use, and history outside the imported range.

## DataGrid selection

DataGrid remains display-state only. Consumers may configure `rowKey` or `getRowKey` to enable generic stable-key selection; DataGrid then exposes `setSelectedRowKey(key)` and marks visible selected rows with `aria-selected` and a CSS class. Views continue to own row-click behavior and event publication. The Items view uses `OwnedItem.id`, so selection does not rely on transient store object references.
