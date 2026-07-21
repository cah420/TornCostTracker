import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

const { FifoCostingStrategy } = await import("./analysis/costing-strategy.js");
const { MarketValueStore } = await import("../stores/market-values.js");
const { applyConversionForTesting } = await import("./conversion-service.js");
const { normalizeConversionLogs } = await import("./importers/purchase-log-importer.js");

const lots = [
  { id: "old", itemId: 1, timestamp: 10, remainingQuantity: 2, basisRemaining: 20, unitCost: 10, costStatus: "known" },
  { id: "new", itemId: 1, timestamp: 20, remainingQuantity: 2, basisRemaining: 40, unitCost: 20, costStatus: "known" },
];
let consumed = FifoCostingStrategy.consume({ itemId: 1, quantity: 3, availableLots: lots });
assert.deepEqual(consumed.consumedLots.map((lot) => lot.lotId), ["old", "new"]);
assert.equal(consumed.totalBasisConsumed, 40);
assert.equal(consumed.remainingLots.find((lot) => lot.id === "new").remainingQuantity, 1);
assert.equal(FifoCostingStrategy.consume({ itemId: 1, quantity: 5, availableLots: lots }).insufficientQuantity, true);
assert.throws(
  () => applyConversionForTesting({
    lots,
    strategy: FifoCostingStrategy,
    event: { id: "missing", sourceLogId: "missing", timestamp: 1, inputItems: [{ itemId: 1, quantity: 5 }], outputItems: [], cashReceived: 0, allocationMethod: "cashOnly" },
  }),
  (error) => error.code === "INSUFFICIENT_TRACKED_QUANTITY",
);
const unresolved = FifoCostingStrategy.consume({ itemId: 2, quantity: 1, availableLots: [{ id: "unknown", itemId: 2, timestamp: 1, remainingQuantity: 1, costStatus: "unresolved", unitCost: null, basisRemaining: null }] });
assert.equal(unresolved.totalBasisConsumed, null);
assert.equal(unresolved.unresolvedQuantity, 1);

MarketValueStore.replace([
  { id: 10, value: { market_price: 50, sell_price: 60 } },
  { id: 11, value: { market_price: 50, sell_price: 20 } },
]);
const inputLots = [{ id: "input", itemId: 1, timestamp: 1, remainingQuantity: 1, basisRemaining: 100, unitCost: 100, costStatus: "known" }];
let applied = applyConversionForTesting({
  lots: inputLots,
  strategy: FifoCostingStrategy,
  event: { id: "conversion-a", sourceLogId: "a", timestamp: 2, inputItems: [{ itemId: 1, quantity: 1 }], outputItems: [{ itemId: 10, quantity: 1 }, { itemId: 11, quantity: 1 }], cashReceived: 25, allocationMethod: "effectiveValue" },
});
assert.equal(applied.record.costingMethod, "fifo");
assert.equal(applied.record.originalCostBasis, 100);
assert.equal(applied.record.cashBasisRecovered, 25);
assert.equal(applied.record.allocatedOutputLots.reduce((sum, lot) => sum + lot.basisOriginal, 0), 75);
assert.equal(applied.record.marketSnapshot[0].effectiveValue, 60);
assert.equal(applied.record.valueReceived, 135);
assert.equal(applied.record.estimatedValueDelta, 35);
assert.equal(inputLots[0].remainingQuantity, 1, "failed or staged work never mutates the input snapshot");

// Two same-item conversions consume distinct FIFO lots rather than reusing
// the oldest lot's basis for every event.
let walletLots = [
  { id: "wallet-4000", itemId: 1078, timestamp: 10, remainingQuantity: 1, basisRemaining: 4000, unitCost: 4000, costStatus: "known" },
  { id: "wallet-4200", itemId: 1078, timestamp: 20, remainingQuantity: 1, basisRemaining: 4200, unitCost: 4200, costStatus: "known" },
];
const walletEvent = (id, timestamp) => ({ id, sourceLogId: id, timestamp, inputItems: [{ itemId: 1078, quantity: 1 }], outputItems: [{ itemId: 10, quantity: 1 }], cashReceived: 15, allocationMethod: "effectiveValue" });
const firstWallet = applyConversionForTesting({ lots: walletLots, strategy: FifoCostingStrategy, event: walletEvent("wallet-open-1", 30) });
walletLots = firstWallet.lots;
const secondWallet = applyConversionForTesting({ lots: walletLots, strategy: FifoCostingStrategy, event: walletEvent("wallet-open-2", 40) });
assert.equal(firstWallet.record.originalCostBasis, 4000);
assert.equal(secondWallet.record.originalCostBasis, 4200);

applied = applyConversionForTesting({
  lots: [{ id: "cash", itemId: 2, timestamp: 1, remainingQuantity: 1, basisRemaining: 10, unitCost: 10, costStatus: "known" }],
  strategy: FifoCostingStrategy,
  event: { id: "conversion-cash", sourceLogId: "cash", timestamp: 2, inputItems: [{ itemId: 2, quantity: 1 }], outputItems: [], cashReceived: 15, allocationMethod: "cashOnly" },
});
assert.equal(applied.record.realizedGain, 5);
assert.equal(applied.record.allocatedOutputLots.length, 0);

const mappings = normalizeConversionLogs([
  { id: "wallet", timestamp: 1, details: { id: 2405, title: "Item use wallet" }, data: { item: 1078, items: [{ id: 1084, qty: 1 }], money: 15 } },
  { id: "bag", timestamp: 2, details: { id: 2340, title: "Item use empty blood bag" }, data: { item: 731, blood_bag: 738 } },
]);
assert.deepEqual(mappings.map((event) => event.allocationMethod), ["effectiveValue", "transfer"]);
assert.equal(mappings[0].cashReceived, 15);
assert.deepEqual(mappings[1].outputItems, [{ itemId: 738, quantity: 1 }]);

console.log("Conversion and FIFO deterministic tests passed.");
