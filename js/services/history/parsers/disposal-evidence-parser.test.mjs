import assert from "node:assert/strict";
import { ParserRegistry } from "../parser-registry.js";
import { CoreInventoryParsers } from "./core-inventory-parsers.js";
import { disposalEvidenceFixtures, evidenceBackedDisposalIds } from "../fixtures/disposal-evidence-fixtures.js";
import { projectCanonicalEvent } from "../accounting-projection.js";
import { buildLedgerTransaction } from "../accounting-ledger.js";
import { buildFifoSource } from "../fifo-consumption.js";

const registry = new ParserRegistry();
CoreInventoryParsers.forEach((parser) => registry.register(parser));
assert.equal(evidenceBackedDisposalIds.length, 53);

const classifications = new Map();
for (const id of evidenceBackedDisposalIds) {
  const fixture = disposalEvidenceFixtures[id];
  const parser = registry.select(fixture.rawLog)[0];
  assert.ok(parser, `log ${id} selects a verified parser`);
  const events = parser.parse({ sourceLogId: fixture.sourceLogId, rawLog: fixture.rawLog });
  assert.ok(events.length, `log ${id} creates normalized evidence`);
  events.forEach((event) => assert.equal(event.sourceLogId, fixture.sourceLogId));
  classifications.set(id, events[0]);
}

for (const id of [1104, 1113, 1221, 1226, 4210]) {
  const event = classifications.get(id);
  assert.equal(event.eventType, "disposal");
  assert.ok(event.movements.some((movement) => movement.direction === "out" && movement.resourceType === "item"));
  assert.ok(event.movements.some((movement) => movement.direction === "in" && movement.resourceType === "cash"));
}
const market = classifications.get(1113);
assert.deepEqual({ gross: market.attributes.grossProceeds, fees: market.attributes.fees, net: market.attributes.netProceeds }, { gross: 746850, fees: 37343, net: 709507 });
assert.equal(market.movements.find((movement) => movement.resourceType === "cash").amount, 709507);
assert.equal(classifications.get(4210).attributes.sourceAttributes.area, "to Big Al's Gun Shop");

const nonCashIds = [1403, 2010, 2020, 2030, 2050, 2060, 2070, 2080, 2090, 2100, 2101, 2102, 2105, 2110, 2180, 2200, 2210, 2211, 2230, 2231, 2240, 2280, 2281, 2290, 2291, 2300, 2310, 2320, 2410, 2420, 2450, 2460, 2470, 4102, 6728, 8936, 8981, 8982, 8983, 9163];
nonCashIds.forEach((id) => {
  const event = classifications.get(id);
  assert.equal(event.eventType, "non_cash_disposal", `log ${id} is a verified non-cash disposal`);
  assert.equal(event.attributes.proceedsStatus, "known_zero");
  assert.ok(event.movements.every((movement) => movement.direction === "out"));
  const projection = projectCanonicalEvent(event);
  assert.equal(projection.classification, "non_cash_disposal");
  const ledger = buildLedgerTransaction(projection);
  assert.equal(ledger.accountingClassification, "non_cash_disposal");
  const fifo = buildFifoSource(ledger);
  assert.ok(fifo.demands.length);
  assert.ok(fifo.demands.every((demand) => demand.proceedsTotal === 0));
});
assert.equal(classifications.get(4102).parserName, "item-send-gift", "outgoing gifts supersede the old neutral-transfer parser");
assert.equal(classifications.get(2480).eventType, "conversion");
assert.equal(classifications.get(8985).eventType, "conversion");
assert.equal(classifications.get(8985).movements.find((movement) => movement.resourceType === "cash").amount, 262054);
assert.equal(classifications.get(9302).eventType, "conversion_input");
assert.equal(projectCanonicalEvent(classifications.get(9302)).unresolvedReason.code, "awaiting_conversion_accounting");
for (const id of [6732, 7000, 9300, 9301]) {
  const event = classifications.get(id);
  assert.equal(event.eventType, "activity");
  assert.equal(event.attributes.reviewRequired, true);
  assert.equal(event.movements.length, 0);
}
assert.equal(classifications.get(4445).eventType, "activity");
assert.equal(classifications.get(4445).attributes.correlationRequired, true);

const malformed = { ...disposalEvidenceFixtures[2290].rawLog, data: { ...disposalEvidenceFixtures[2290].rawLog.data, invented: true } };
assert.throws(() => registry.select(malformed)[0].parse({ sourceLogId: "malformed", rawLog: malformed }), /unsupported payload signature/);
console.log("All 53 evidence-backed Disposal Accounting contracts are explicitly parsed and classified.");
