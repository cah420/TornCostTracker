import assert from "node:assert/strict";
import { ParserRegistry } from "./parser-registry.js";
import { CoreInventoryParsers } from "./parsers/core-inventory-parsers.js";
import { coreInventoryFixtures as fixtures } from "./fixtures/core-inventory-fixtures.js";

const registry = new ParserRegistry();
CoreInventoryParsers.forEach((parser) => registry.register(parser));
for (const [name, rawLog] of Object.entries(fixtures)) {
  const parser = registry.select(rawLog)[0];
  assert.ok(parser, `${name} selects a parser`);
  const event = parser.parse({ sourceLogId: `fixture-${name}`, rawLog })[0];
  assert.ok(event.movements.length, `${name} produces observable movements`);
  assert.equal(event.sourceLogId, `fixture-${name}`);
}
const city = registry.select(fixtures.cityShop)[0].parse({ sourceLogId: "city", rawLog: fixtures.cityShop })[0];
assert.equal(city.movements.find((movement) => movement.resourceType === "item").quantity, 2);
assert.equal(city.movements.find((movement) => movement.resourceType === "cash").direction, "out");
const legacyItemMarketPurchase = registry.select(fixtures.legacyItemMarketPurchase)[0].parse({ sourceLogId: "legacy-item-market-purchase", rawLog: fixtures.legacyItemMarketPurchase })[0];
assert.equal(legacyItemMarketPurchase.eventType, "acquisition");
assert.equal(legacyItemMarketPurchase.movements.find((movement) => movement.resourceType === "item").direction, "in");
assert.equal(legacyItemMarketPurchase.movements.find((movement) => movement.resourceType === "cash").amount, 75);
assert.equal(legacyItemMarketPurchase.movements.find((movement) => movement.resourceType === "cash").direction, "out");
assert.equal(legacyItemMarketPurchase.movements.find((movement) => movement.resourceType === "item").attributes.uid, "12257878427");
assert.equal(legacyItemMarketPurchase.counterparties.find((entry) => entry.role === "seller").entityId, "45");
assert.equal(legacyItemMarketPurchase.attributes.costInterpretation, "single_item_transaction_total");
assert.deepEqual(registry.select(fixtures.legacyItemMarketPurchase)[0].parse({ sourceLogId: "same-legacy-item-market", rawLog: fixtures.legacyItemMarketPurchase }), registry.select(fixtures.legacyItemMarketPurchase)[0].parse({ sourceLogId: "same-legacy-item-market", rawLog: fixtures.legacyItemMarketPurchase }), "legacy Item Market events retain deterministic canonical IDs");
const legacy = registry.select(fixtures.legacyBazaarMultiple)[0].parse({ sourceLogId: "legacy", rawLog: fixtures.legacyBazaarMultiple })[0];
assert.equal(legacy.eventType, "acquisition");
assert.equal(legacy.movements.find((movement) => movement.resourceType === "item").direction, "in");
assert.equal(legacy.movements.find((movement) => movement.resourceType === "item").quantity, 4);
assert.equal(legacy.movements.find((movement) => movement.resourceType === "cash").amount, 100);
assert.equal(legacy.movements.find((movement) => movement.resourceType === "cash").direction, "out");
assert.equal(legacy.attributes.costEach, 25);
assert.equal(legacy.counterparties.find((entry) => entry.role === "seller").entityId, "47");
const abroad = registry.select(fixtures.abroadPurchaseMultiple)[0].parse({ sourceLogId: "abroad", rawLog: fixtures.abroadPurchaseMultiple })[0];
assert.equal(abroad.eventType, "acquisition");
assert.equal(abroad.movements.find((movement) => movement.resourceType === "item").quantity, 5);
assert.equal(abroad.movements.find((movement) => movement.resourceType === "cash").amount, 875);
assert.deepEqual(abroad.attributes.location, { area: 2 });
assert.deepEqual(
  registry.select(fixtures.abroadPurchase)[0].parse({ sourceLogId: "same-abroad", rawLog: fixtures.abroadPurchase }),
  registry.select(fixtures.abroadPurchase)[0].parse({ sourceLogId: "same-abroad", rawLog: fixtures.abroadPurchase }),
  "new purchase events retain deterministic canonical IDs",
);
assert.equal(registry.select(fixtures.legacyBazaar)[0].coverageStatus, "partial");
assert.equal(registry.select(fixtures.abroadPurchase)[0].coverageStatus, "partial");
const grenadeBox = registry.select(fixtures.grenadeBox)[0].parse({ sourceLogId: "grenade-box", rawLog: fixtures.grenadeBox })[0];
assert.equal(grenadeBox.eventType, "conversion");
assert.equal(grenadeBox.movements.find((movement) => movement.role === "input").direction, "out");
assert.equal(grenadeBox.movements.find((movement) => movement.role === "output").direction, "in");
assert.equal(grenadeBox.movements.find((movement) => movement.role === "output").quantity, 100);
const stashBox = registry.select(fixtures.stashBox)[0].parse({ sourceLogId: "stash-box", rawLog: fixtures.stashBox })[0];
assert.equal(stashBox.eventType, "conversion");
assert.equal(stashBox.movements.find((movement) => movement.resourceType === "cash").amount, 39000);
assert.equal(stashBox.movements.find((movement) => movement.resourceType === "cash").direction, "in");
assert.equal(registry.select(fixtures.grenadeBox)[0].coverageStatus, "partial");
const saleFixtures = [fixtures.legacyItemMarketSale, fixtures.itemMarketSale, fixtures.legacyBazaarSale, fixtures.bazaarSale, fixtures.cityShopSale];
saleFixtures.forEach((rawLog, index) => {
  const parser = registry.select(rawLog)[0]; const event = parser.parse({ sourceLogId: `sale-${index}`, rawLog })[0];
  assert.equal(event.eventType, "disposal");
  assert.equal(event.movements.find((movement) => movement.resourceType === "item").direction, "out");
  assert.equal(event.movements.find((movement) => movement.resourceType === "cash").direction, "in");
  assert.equal(parser.coverageStatus, "partial");
});
const legacyMarketSale = registry.select(fixtures.legacyItemMarketSale)[0].parse({ sourceLogId: "legacy-market-sale", rawLog: fixtures.legacyItemMarketSale })[0];
assert.equal(legacyMarketSale.movements.find((movement) => movement.resourceType === "item").attributes.uid, "12251154083");
assert.equal(legacyMarketSale.counterparties.find((entry) => entry.role === "buyer").entityId, "fixture-buyer");
const currentMarketSale = registry.select(fixtures.itemMarketSale)[0].parse({ sourceLogId: "market-sale", rawLog: fixtures.itemMarketSale })[0];
assert.equal(currentMarketSale.attributes.unitPrice, null);
assert.equal(currentMarketSale.attributes.totalProceeds, 2000000);
assert.deepEqual(registry.select(fixtures.cityShopSale)[0].parse({ sourceLogId: "city-sale", rawLog: fixtures.cityShopSale })[0].attributes.sourceAttributes, { area: null });
assert.deepEqual(
  registry.select(fixtures.bazaarSale)[0].parse({ sourceLogId: "same-sale", rawLog: fixtures.bazaarSale }),
  registry.select(fixtures.bazaarSale)[0].parse({ sourceLogId: "same-sale", rawLog: fixtures.bazaarSale }),
  "cash-sale events retain deterministic canonical IDs",
);
const legacyTransfer = registry.select(fixtures.legacyItemReceive)[0].parse({ sourceLogId: "legacy-transfer", rawLog: fixtures.legacyItemReceive })[0];
assert.equal(legacyTransfer.eventType, "transfer");
assert.equal(legacyTransfer.movements[0].direction, "in");
assert.equal(legacyTransfer.movements[0].quantity, 2);
assert.equal(legacyTransfer.counterparties[0].role, "sender");
assert.equal(legacyTransfer.counterparties[0].entityId, "47");
assert.equal(registry.select(fixtures.legacyItemReceive)[0].family, "Transfer");
const sentTransfer = registry.select(fixtures.itemSend)[0].parse({ sourceLogId: "send-transfer", rawLog: fixtures.itemSend })[0];
assert.equal(sentTransfer.movements[0].direction, "out");
assert.equal(sentTransfer.movements[0].attributes.uid, "12509402993");
assert.equal(sentTransfer.counterparties[0].role, "receiver");
const receivedTransfer = registry.select(fixtures.itemReceive)[0].parse({ sourceLogId: "receive-transfer", rawLog: fixtures.itemReceive })[0];
assert.equal(receivedTransfer.movements.reduce((sum, movement) => sum + movement.quantity, 0), 5);
assert.equal(receivedTransfer.movements.every((movement) => movement.direction === "in"), true);
assert.deepEqual(registry.select(fixtures.itemSend)[0].parse({ sourceLogId: "same-transfer", rawLog: fixtures.itemSend }), registry.select(fixtures.itemSend)[0].parse({ sourceLogId: "same-transfer", rawLog: fixtures.itemSend }), "transfer events retain deterministic canonical IDs");
const invalidTransfers = [
  { ...fixtures.legacyItemReceive, data: { ...fixtures.legacyItemReceive.data, sender: null } },
  { ...fixtures.legacyItemReceive, data: { ...fixtures.legacyItemReceive.data, item: null } },
  { ...fixtures.legacyItemReceive, data: { ...fixtures.legacyItemReceive.data, quantity: 0 } },
  { ...fixtures.itemSend, data: { ...fixtures.itemSend.data, receiver: null } },
  { ...fixtures.itemSend, data: { ...fixtures.itemSend.data, items: [{ qty: 1 }] } },
  { ...fixtures.itemSend, data: { ...fixtures.itemSend.data, items: [{ id: 199, qty: 1 }, { id: 199, qty: 1 }] } },
  { ...fixtures.itemSend, data: { ...fixtures.itemSend.data, items: { 199: 1 } } },
  { ...fixtures.itemReceive, data: { ...fixtures.itemReceive.data, sender: null } },
  { ...fixtures.itemReceive, data: { ...fixtures.itemReceive.data, items: [{ id: 792, qty: 1 }] } },
  { ...fixtures.itemReceive, data: { ...fixtures.itemReceive.data, unexpected: true } },
];
invalidTransfers.forEach((rawLog, index) => {
  const parser = registry.select(rawLog)[0];
  assert.throws(() => parser.parse({ sourceLogId: `invalid-transfer-${index}`, rawLog }), /invalid|unsupported|duplicate/i);
});
const invalidSales = [
  { ...fixtures.legacyItemMarketSale, data: { ...fixtures.legacyItemMarketSale.data, cost: undefined } },
  { ...fixtures.legacyItemMarketSale, data: { ...fixtures.legacyItemMarketSale.data, item: [{ id: 180, qty: 2 }] } },
  { ...fixtures.itemMarketSale, data: { ...fixtures.itemMarketSale.data, cost_total: -1 } },
  { ...fixtures.itemMarketSale, data: { ...fixtures.itemMarketSale.data, buyer: null } },
  { ...fixtures.legacyBazaarSale, data: { ...fixtures.legacyBazaarSale.data, quantity: 0 } },
  { ...fixtures.legacyBazaarSale, data: { ...fixtures.legacyBazaarSale.data, cost_total: 15601 } },
  { ...fixtures.bazaarSale, data: { ...fixtures.bazaarSale.data, items: [{ id: 1080, qty: 1 }, { id: 1080, qty: 1 }] } },
  { ...fixtures.cityShopSale, data: { ...fixtures.cityShopSale.data, total_value: undefined } },
  { ...fixtures.cityShopSale, data: { ...fixtures.cityShopSale.data, area: 1 } },
];
invalidSales.forEach((rawLog, index) => {
  const parser = registry.select(rawLog)[0];
  assert.throws(() => parser.parse({ sourceLogId: `invalid-sale-${index}`, rawLog }), /invalid|unsupported|inconsistent|duplicate/i);
});
const invalidConversions = [
  { ...fixtures.grenadeBox, data: { ...fixtures.grenadeBox.data, item: null } },
  { ...fixtures.grenadeBox, data: { ...fixtures.grenadeBox.data, item2: [{ id: 242 }] } },
  { ...fixtures.grenadeBox, data: { ...fixtures.grenadeBox.data, quantity: undefined } },
  { ...fixtures.grenadeBox, data: { ...fixtures.grenadeBox.data, quantity: 99 } },
  { ...fixtures.grenadeBox, data: { ...fixtures.grenadeBox.data, item2: [{ id: 242, qty: 1 }, { id: 242, qty: 1 }] } },
  { ...fixtures.medicalBox, data: { ...fixtures.medicalBox.data, item2: { unexpected: true } } },
  { ...fixtures.stashBox, data: { ...fixtures.stashBox.data, money: -1 } },
  { ...fixtures.stashBox, data: { ...fixtures.stashBox.data, money: undefined } },
];
invalidConversions.forEach((rawLog, index) => {
  const parser = registry.select(rawLog)[0];
  assert.throws(() => parser.parse({ sourceLogId: `invalid-conversion-${index}`, rawLog }), /invalid|unsupported|duplicate/i);
});
const invalidPurchases = [
  { ...fixtures.legacyItemMarketPurchase, data: { ...fixtures.legacyItemMarketPurchase.data, cost: undefined } },
  { ...fixtures.legacyItemMarketPurchase, data: { ...fixtures.legacyItemMarketPurchase.data, cost: 0 } },
  { ...fixtures.legacyItemMarketPurchase, data: { ...fixtures.legacyItemMarketPurchase.data, seller: null } },
  { ...fixtures.legacyItemMarketPurchase, data: { ...fixtures.legacyItemMarketPurchase.data, item: [] } },
  { ...fixtures.legacyItemMarketPurchase, data: { ...fixtures.legacyItemMarketPurchase.data, item: [{ id: 528, qty: 2, uid: null }] } },
  { ...fixtures.legacyItemMarketPurchase, data: { ...fixtures.legacyItemMarketPurchase.data, item: [{ id: 528, qty: 1 }, { id: 529, qty: 1 }] } },
  { ...fixtures.legacyItemMarketPurchase, data: { ...fixtures.legacyItemMarketPurchase.data, item: [{ id: 0, qty: 1 }] } },
  { ...fixtures.legacyItemMarketPurchase, data: { ...fixtures.legacyItemMarketPurchase.data, item: { unexpected: true } } },
  { ...fixtures.legacyBazaar, data: { ...fixtures.legacyBazaar.data, item: 0 } },
  { ...fixtures.legacyBazaar, data: { ...fixtures.legacyBazaar.data, quantity: 0 } },
  { ...fixtures.legacyBazaar, data: { ...fixtures.legacyBazaar.data, cost_total: undefined } },
  { ...fixtures.legacyBazaar, data: { ...fixtures.legacyBazaar.data, cost_total: 251 } },
  { ...fixtures.abroadPurchase, data: { ...fixtures.abroadPurchase.data, item: null } },
  { ...fixtures.abroadPurchase, data: { ...fixtures.abroadPurchase.data, quantity: -1 } },
  { ...fixtures.abroadPurchase, data: { ...fixtures.abroadPurchase.data, cost_each: undefined } },
  { ...fixtures.abroadPurchase, data: { ...fixtures.abroadPurchase.data, cost_total: 401 } },
  { ...fixtures.abroadPurchase, data: { ...fixtures.abroadPurchase.data, area: null } },
];
invalidPurchases.forEach((rawLog, index) => {
  const parser = registry.select(rawLog)[0];
  assert.throws(() => parser.parse({ sourceLogId: `invalid-purchase-${index}`, rawLog }), /invalid|inconsistent|unsupported|ambiguous/i);
});
const trade = registry.select(fixtures.tradeOffer)[0].parse({ sourceLogId: "trade", rawLog: fixtures.tradeOffer })[0];
assert.equal(trade.attributes.state, "offered", "incomplete trade facts are not treated as completed accounting movements");
assert.ok(trade.counterparties.length);
const unsupported = { ...fixtures.cityShop, data: { cost_total: 10 } };
assert.throws(() => registry.select(unsupported)[0].parse({ sourceLogId: "bad", rawLog: unsupported }), /no supported item lines/);
console.log("Core inventory parser fixture tests passed.");
