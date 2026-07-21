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
const invalidPurchases = [
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
  assert.throws(() => parser.parse({ sourceLogId: `invalid-purchase-${index}`, rawLog }), /invalid|inconsistent/i);
});
const trade = registry.select(fixtures.tradeOffer)[0].parse({ sourceLogId: "trade", rawLog: fixtures.tradeOffer })[0];
assert.equal(trade.attributes.state, "offered", "incomplete trade facts are not treated as completed accounting movements");
assert.ok(trade.counterparties.length);
const unsupported = { ...fixtures.cityShop, data: { cost_total: 10 } };
assert.throws(() => registry.select(unsupported)[0].parse({ sourceLogId: "bad", rawLog: unsupported }), /no supported item lines/);
console.log("Core inventory parser fixture tests passed.");
