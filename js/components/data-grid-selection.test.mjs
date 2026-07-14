import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

class FakeClassList {
  constructor(){ this.values = new Set(); }
  add(value){ this.values.add(value); }
  toggle(value, force){
    if (force) this.values.add(value);
    else this.values.delete(value);
  }
  contains(value){ return this.values.has(value); }
}

class FakeElement {
  constructor(){
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList();
  }
  append(...children){ this.children.push(...children); }
  appendChild(child){ this.children.push(child); return child; }
  replaceChildren(...children){ this.children = children; }
  setAttribute(name, value){ this.attributes.set(name, String(value)); }
  getAttribute(name){ return this.attributes.get(name) ?? null; }
  addEventListener(name, callback){ this.listeners.set(name, callback); }
}

globalThis.Node = FakeElement;
globalThis.document = { createElement: () => new FakeElement() };
globalThis.localStorage = {
  values: new Map(),
  getItem(key){ return this.values.get(key) ?? null; },
  setItem(key, value){ this.values.set(key, value); },
  removeItem(key){ this.values.delete(key); },
  clear(){ this.values.clear(); },
};

const { DataGrid } = await import("./data-grid.js");
const { purchaseSearchMatches } = await import("../views/purchases.js");

const rows = [{ id: "one", name: "Alpha" }, { id: "two", name: "Bravo" }];
const grid = new DataGrid({
  columns: [{ label: "Name", key: "name" }],
  rows,
  rowKey: "id",
  onRowClick: () => {},
});

function bodyRows(){ return grid.element.children[1].children; }
bodyRows()[0].listeners.get("click")();
assert.equal(grid.selectedRowKey, "two", "default descending sort selects Bravo first");
assert.equal(bodyRows()[0].classList.contains("tct-data-grid__row--selected"), true);
bodyRows()[1].listeners.get("click")();
assert.equal(grid.selectedRowKey, "one");
assert.equal(bodyRows()[0].classList.contains("tct-data-grid__row--selected"), false);

grid.setSort("name");
assert.equal(bodyRows()[0].getAttribute("aria-selected"), "true", "selection survives sorting");
grid.setRows([{ id: "two", name: "Bravo" }]);
assert.equal(bodyRows()[0].getAttribute("aria-selected"), "false", "hidden selections remain logical only");
grid.setRows(rows);
assert.equal(bodyRows()[0].getAttribute("aria-selected"), "true", "selection returns when the row returns");
grid.setRows([{ id: "one", name: "Alpha (refreshed)" }, { id: "two", name: "Bravo" }]);
assert.equal(bodyRows()[0].getAttribute("aria-selected"), "true", "selection survives data replacement by stable key");

const purchaseRow = {
  itemName: "Xanax",
  source: "Abroad - Cayman Islands",
  counterpartyId: 42,
  tradeId: "trade-8",
  acquisitionId: "log-9",
  timestamp: 1_700_000_000,
};
assert.equal(purchaseSearchMatches(purchaseRow, " xanax "), true);
assert.equal(purchaseSearchMatches(purchaseRow, "cayman"), true);
assert.equal(purchaseSearchMatches(purchaseRow, "missing"), false);
assert.equal(purchaseSearchMatches(purchaseRow, ""), true);

const itemDetailsSource = await readFile(new URL("./ItemDetails/item-details.js", import.meta.url), "utf8");
assert.equal(itemDetailsSource.includes("new DataGrid"), false, "Item Details Purchases does not render a matched-lots grid");

console.log("DataGrid selection and purchase search deterministic tests passed.");
