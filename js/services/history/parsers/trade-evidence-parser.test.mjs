import assert from "node:assert/strict";
import { TradeEvidenceParsers } from "./trade-evidence-parser.js";

const fixtures = [
  { log: 4430, title: "Trade completed", timestamp: 1, data: { parsed_trade_id: 77, trade_id: "opaque", user: 5 } },
  { log: 4440, title: "Trade money outgoing", timestamp: 2, data: { money: 100, parsed_trade_id: 77, trade_id: "opaque", user: 5 } },
  { log: 4441, title: "Trade money incoming", timestamp: 3, data: { money: 50, parsed_trade_id: 77, trade_id: "opaque", user: 5 } },
  { log: 4445, title: "Trade items outgoing", timestamp: 4, data: { items: [{ id: 9, qty: 1, uid: 10 }, { id: 9, qty: 1, uid: 11 }], parsed_trade_id: 77, trade_id: "opaque", user: 5 } },
];
fixtures.forEach((rawLog, index) => {
  const parsers = TradeEvidenceParsers.filter((parser) => parser.matches(rawLog)); assert.equal(parsers.length, 1);
  const event = parsers[0].parse({ sourceLogId: `trade-${index}`, rawLog })[0];
  assert.equal(event.attributes.tradeId, 77); assert.equal(event.attributes.opaqueTradeId, "opaque"); assert.equal(event.attributes.correlationRequired, true);
});
const itemEvent = TradeEvidenceParsers.at(-1).parse({ sourceLogId: "items", rawLog: fixtures.at(-1) })[0];
assert.equal(itemEvent.movements[0].attributes.uid, "10");
assert.equal(itemEvent.movements[1].attributes.uid, "11", "multiple UID instances of one Item ID remain separate evidence rows");
assert.throws(() => TradeEvidenceParsers[1].parse({ sourceLogId: "bad", rawLog: { ...fixtures[1], data: { ...fixtures[1].data, extra: true } } }), /unsupported payload signature/);
console.log("Trade evidence parser tests passed.");
