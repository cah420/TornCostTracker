import assert from "node:assert/strict";
import { createCashSaleParser } from "./cash-sale-parser.js";

const parser = createCashSaleParser({ name: "test-sale", logType: 999997, title: "Test sale", market: { role: "market", entityType: "test" }, itemField: "items", totalField: "total", unitField: "each", buyerField: "buyer" });
const event = parser.parse({ sourceLogId: "sale", rawLog: { log: 999997, title: "Test sale", timestamp: 1, data: { buyer: "buyer", each: 10, total: 30, items: [{ id: 1, qty: 3, uid: 99 }] } } })[0];
assert.equal(event.eventType, "disposal");
assert.equal(event.movements.find((movement) => movement.resourceType === "item").direction, "out");
assert.equal(event.movements.find((movement) => movement.resourceType === "cash").direction, "in");
assert.equal(event.movements.find((movement) => movement.resourceType === "item").attributes.uid, "99");
assert.throws(() => parser.parse({ sourceLogId: "bad-total", rawLog: { log: 999997, title: "Test sale", timestamp: 1, data: { buyer: "buyer", each: 10, total: 31, items: [{ id: 1, qty: 3 }] } } }), /inconsistent/i);
assert.throws(() => parser.parse({ sourceLogId: "bad-buyer", rawLog: { log: 999997, title: "Test sale", timestamp: 1, data: { buyer: null, each: 10, total: 30, items: [{ id: 1, qty: 3 }] } } }), /buyer/i);
console.log("Cash sale parser deterministic tests passed.");
