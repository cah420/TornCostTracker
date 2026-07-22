import assert from "node:assert/strict";
import { createItemConversionParser } from "./item-conversion-parser.js";

const parser = createItemConversionParser({ name: "test-conversion", logType: 999998, title: "Test conversion", inputField: "item", outputItemField: "items" });
const event = parser.parse({ sourceLogId: "conversion-test", rawLog: { log: 999998, title: "Test conversion", timestamp: 1, data: { item: 1, items: [{ id: 2, qty: 3 }, { id: 3, qty: 4 }] } } })[0];
assert.equal(event.eventType, "conversion");
assert.equal(event.movements.filter((movement) => movement.direction === "out").length, 1);
assert.equal(event.movements.filter((movement) => movement.direction === "in").length, 2);
assert.throws(() => parser.parse({ sourceLogId: "duplicate", rawLog: { log: 999998, title: "Test conversion", timestamp: 1, data: { item: 1, items: [{ id: 2, qty: 1 }, { id: 2, qty: 1 }] } } }), /duplicate/i);
assert.throws(() => parser.parse({ sourceLogId: "bad", rawLog: { log: 999998, title: "Test conversion", timestamp: 1, data: { item: 1, items: "unknown" } } }), /unsupported/i);
console.log("Item conversion parser deterministic tests passed.");
