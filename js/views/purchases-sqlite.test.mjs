import assert from "node:assert/strict";
import fs from "node:fs";

const view = fs.readFileSync(new URL("./purchases.js", import.meta.url), "utf8");
const details = fs.readFileSync(new URL("../components/ItemDetails/item-details.js", import.meta.url), "utf8");
assert.match(view, /PurchasesQueries/); assert.match(view, /Loading SQLite inventory positions/); assert.match(view, /No remaining inventory positions/); assert.match(view, /Unable to load position details/); assert.match(view, /isCurrent/);
assert.doesNotMatch(view, /PurchaseStore|PurchaseSyncService|CostBasisService|localStorage|Storage\./); assert.doesNotMatch(view, /SELECT\s+\w+\s+FROM|FROM\s+accounting_/i);
assert.match(details, /PurchasesQueries/); assert.doesNotMatch(details, /PurchaseStore|CostBasisService|CostLotStore/);
console.log("Purchases and Item Details SQLite consumer boundary tests passed.");
