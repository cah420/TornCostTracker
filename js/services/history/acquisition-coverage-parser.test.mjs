import assert from "node:assert/strict";
import { ParserRegistry } from "./parser-registry.js";
import { CoreInventoryParsers } from "./parsers/core-inventory-parsers.js";
import { createVirusProgrammingParser } from "./parsers/acquisition-coverage-parser.js";
import { acquisitionCoverageFixtures as fixtures, virusProgrammingFixtures } from "./fixtures/acquisition-coverage-fixtures.js";
import { projectCanonicalEvent } from "./accounting-projection.js";
import { buildLedgerTransaction } from "./accounting-ledger.js";
import { buildCostLotDisposition, CostLotDisposition } from "./cost-lot.js";

const registry = new ParserRegistry();
CoreInventoryParsers.forEach((parser) => registry.register(parser));

const expected = Object.freeze({
  legacyDumpFind: ["reward", "reward_non_cash", 1, "known_no_cash_consideration"],
  dumpFind: ["reward", "reward_non_cash", 1, "known_no_cash_consideration"],
  halloweenTreat: ["activity", "unsupported_semantics", 0, null],
  legacyReceive: ["gift_received", "reward_non_cash", 1, "known_no_cash_consideration"],
  currentReceive: ["gift_received", "reward_non_cash", 1, "known_no_cash_consideration"],
  tradeIncoming: ["activity", "trade_unresolved", 0, null],
  keepsake: ["non_cash_acquisition", "non_cash_acquisition", 1, "unknown_basis"],
  referral: ["reward", "reward_non_cash", 2, "unknown_basis"],
  stock: ["reward", "reward_non_cash", 1, "unknown_basis"],
  subscription: ["reward", "reward_non_cash", 2, "unknown_basis"],
  virus: ["reward", "reward_non_cash", 1, "known_no_cash_consideration"],
  job: ["non_cash_acquisition", "non_cash_acquisition", 1, "unknown_basis"],
  company: ["non_cash_acquisition", "non_cash_acquisition", 1, "unknown_basis"],
  factionPayout: ["reward", "reward_non_cash", 1, "unknown_basis"],
  mission: ["non_cash_acquisition", "non_cash_acquisition", 1, "unknown_basis"],
  wheel: ["reward", "reward_non_cash", 1, "unknown_basis"],
  christmasFind: ["reward", "reward_non_cash", 1, "known_no_cash_consideration"],
  christmasPurchase: ["non_cash_acquisition", "non_cash_acquisition", 1, "unknown_basis"],
  christmasItems: ["reward", "reward_non_cash", 2, "unknown_basis"],
  easterEgg: ["reward", "reward_non_cash", 1, "known_no_cash_consideration"],
});

for (const [fixtureName, rawLog] of Object.entries(fixtures)) {
  const parsers = registry.select(rawLog);
  assert.equal(parsers.length, 1, `${fixtureName} dispatches to exactly one exact-ID parser`);
  const input = { sourceLogId: `coverage-${fixtureName}`, rawLog };
  const event = parsers[0].parse(input)[0];
  const [eventType, classification, lotCount, basisStatus] = expected[fixtureName];
  assert.equal(event.eventType, eventType, `${fixtureName} canonical type`);
  assert.deepEqual(parsers[0].parse(input), parsers[0].parse(input), `${fixtureName} replay is deterministic`);
  const projection = projectCanonicalEvent(event);
  assert.equal(projection.classification, classification, `${fixtureName} accounting classification`);
  const ledger = buildLedgerTransaction(projection);
  const incomingQuantity = event.movements.filter((movement) => movement.resourceType === "item" && movement.direction === "in").reduce((sum, movement) => sum + movement.quantity, 0);
  const ledgerQuantity = ledger.lines.filter((line) => line.movementDirection === "in").reduce((sum, line) => sum + (line.quantity ?? 0), 0);
  if (event.parserName !== "trade") assert.equal(ledgerQuantity, incomingQuantity, `${fixtureName} ledger preserves inbound quantity`);
  const lots = buildCostLotDisposition(ledger);
  assert.equal(lots.lots.length, lotCount, `${fixtureName} Cost Lot count`);
  if (basisStatus) assert.ok(lots.lots.every((lot) => lot.basisStatus === basisStatus), `${fixtureName} basis status`);
  if (!lotCount) assert.ok([CostLotDisposition.ineligible, CostLotDisposition.unresolved].includes(lots.disposition.disposition), `${fixtureName} intentionally creates no supply`);
}

const multi = registry.select(fixtures.christmasItems)[0].parse({ sourceLogId: "coverage-multi", rawLog: fixtures.christmasItems })[0];
assert.deepEqual(multi.movements.map((movement) => [movement.resourceId, movement.quantity]), [["985", 1], ["986", 1]], "all multi-item outputs are retained");
const uid = registry.select(fixtures.dumpFind)[0].parse({ sourceLogId: "coverage-uid", rawLog: fixtures.dumpFind })[0];
assert.equal(uid.movements[0].attributes.uid, undefined, "sentinel UID zero is not treated as item identity");
const trade = registry.select(fixtures.tradeIncoming)[0].parse({ sourceLogId: "coverage-trade", rawLog: fixtures.tradeIncoming })[0];
assert.equal(trade.attributes.tradeId, 9167353);
assert.equal(trade.movements[0].quantity, 92);
assert.equal(projectCanonicalEvent(trade).unresolvedReason.code, "trade_correlation_required");
assert.equal(trade.movements.some((movement) => movement.direction === "in"), false, "incoming trade evidence is not an inventory movement");

virusProgrammingFixtures.forEach(({ rawLog, itemId }, index) => {
  const parser = registry.select(rawLog)[0];
  const event = parser.parse({ sourceLogId: `virus-${index}`, rawLog })[0];
  assert.equal(event.movements.length, 1);
  assert.equal(event.movements[0].resourceId, String(itemId));
  assert.equal(event.movements[0].quantity, 1);
  const lots = buildCostLotDisposition(buildLedgerTransaction(projectCanonicalEvent(event)));
  assert.equal(lots.lots.length, 1);
  assert.equal(lots.lots[0].unitBasis, 0);
});
const injectedResolver = createVirusProgrammingParser({ itemResolver: () => 999 });
assert.equal(injectedResolver.parse({ sourceLogId: "injected-virus", rawLog: fixtures.virus })[0].movements[0].resourceId, "999");
assert.throws(() => registry.select({ ...fixtures.virus, data: { virus: "an unknown" } })[0].parse({ sourceLogId: "unknown-virus", rawLog: { ...fixtures.virus, data: { virus: "an unknown" } } }), /item resolution failed: unknown_identifier/i);
assert.throws(() => registry.select({ ...fixtures.virus, data: { virus: "" } })[0].parse({ sourceLogId: "empty-virus", rawLog: { ...fixtures.virus, data: { virus: "" } } }), /item resolution failed: invalid_identifier/i);

const withExtraParams = { ...fixtures.dumpFind, params: { ...fixtures.dumpFind.params, optionalPresentationField: true } };
assert.doesNotThrow(() => registry.select(withExtraParams)[0].parse({ sourceLogId: "optional-params", rawLog: withExtraParams }), "non-semantic params do not break parsing");
const malformed = [
  { ...fixtures.dumpFind, data: { ...fixtures.dumpFind.data, item: [] } },
  { ...fixtures.keepsake, data: { ...fixtures.keepsake.data, points_used: 0 } },
  { ...fixtures.company, data: { ...fixtures.company.data, item: {} } },
  { ...fixtures.christmasItems, data: { ...fixtures.christmasItems.data, unexpected: true } },
  { ...fixtures.tradeIncoming, data: { ...fixtures.tradeIncoming.data, parsed_trade_id: null } },
];
malformed.forEach((rawLog, index) => {
  const parser = registry.select(rawLog)[0];
  assert.throws(() => parser.parse({ sourceLogId: `malformed-${index}`, rawLog }), /invalid|unsupported|positive|contains no items/i);
});

assert.notEqual(registry.select(fixtures.legacyDumpFind)[0].name, registry.select(fixtures.dumpFind)[0].name, "legacy/current dump contracts dispatch independently");
assert.notEqual(registry.select(fixtures.legacyReceive)[0].name, registry.select(fixtures.currentReceive)[0].name, "legacy/current gift contracts dispatch independently");
console.log("Acquisition coverage parser and pipeline tests passed.");
