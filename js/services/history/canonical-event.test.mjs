import assert from "node:assert/strict";
import { ParserRegistry } from "./parser-registry.js";
import { WalletParser } from "./parsers/wallet-parser.js";
import { BloodBagParser } from "./parsers/blood-bag-parser.js";
import { CoreInventoryParsers } from "./parsers/core-inventory-parsers.js";
import { coreInventoryFixtures } from "./fixtures/core-inventory-fixtures.js";
import { createCanonicalEvent } from "./canonical-event.js";
import { ReplayService } from "./replay-service.js";

const registry = new ParserRegistry();
registry.register(WalletParser);
registry.register(BloodBagParser);
assert.equal(registry.list().length, 2);
assert.throws(() => registry.register(WalletParser), /already registered/);

const wallet = { log: 2405, title: "Item use wallet", timestamp: 100, category: "Items", data: { item: { id: 180, qty: 1 }, items: [{ id: 1, qty: 2 }], money: 75 } };
const first = WalletParser.parse({ sourceLogId: "wallet-log", rawLog: wallet });
const second = WalletParser.parse({ sourceLogId: "wallet-log", rawLog: wallet });
assert.deepEqual(first, second, "same raw log and parser version yields identical events");
assert.equal(first[0].eventType, "conversion");
assert.equal(first[0].movements.filter((movement) => movement.resourceType === "item").length, 2);
assert.equal(first[0].movements.find((movement) => movement.resourceType === "cash").amount, 75);

const blood = BloodBagParser.parse({ sourceLogId: "blood-log", rawLog: { log: 2340, title: "Item use empty blood bag", timestamp: 101, data: { item: { id: 32 }, blood_bag: { id: 33 } } } });
assert.equal(blood[0].movements.length, 2, "same generic movement model represents blood-bag conversion");
assert.throws(() => createCanonicalEvent({ sourceLogId: "bad", eventTimestamp: 1, eventType: "activity", parserName: "x", parserVersion: "1", movements: [{ direction: "sideways", resourceType: "item" }] }), /Invalid canonical movement/);

const genericFixtures = [
  { eventType: "acquisition", movements: [{ direction: "in", resourceType: "item", resourceId: "1", quantity: 1 }, { direction: "out", resourceType: "cash", amount: 10 }] },
  { eventType: "disposal", movements: [{ direction: "out", resourceType: "item", resourceId: "1", quantity: 1 }, { direction: "in", resourceType: "cash", amount: 10 }] },
  { eventType: "reward", movements: [{ direction: "in", resourceType: "item", resourceId: "2", quantity: 1 }, { direction: "in", resourceType: "cash", amount: 5 }] },
  { eventType: "progression", movements: [{ direction: "increase", resourceType: "experience", amount: 3 }] },
];
genericFixtures.forEach((fixture, index) => createCanonicalEvent({ sourceLogId: `fixture-${index}`, eventTimestamp: index + 1, parserName: "fixture", parserVersion: "1", ...fixture }));

class MemoryRawLogs {
  constructor(rows){ this.rows = rows; }
  async pageForReplay({ timestamp = null, sourceLogId = null }){
    return this.rows.filter((row) => timestamp === null || row.event_timestamp > timestamp || (row.event_timestamp === timestamp && row.source_log_id > sourceLogId));
  }
}
class MemoryEvents {
  constructor(){ this.events = new Map(); this.states = []; }
  async storeResult(result){
    const output = result.events ?? [];
    const inserted = output.filter((event) => !this.events.has(event.id));
    inserted.forEach((event) => this.events.set(event.id, event));
    this.states.push(result);
    return { inserted: inserted.length, duplicates: output.length - inserted.length };
  }
}
const rows = [
  { source_log_id: "a", event_timestamp: 100, raw_json: JSON.stringify(wallet) },
  { source_log_id: "b", event_timestamp: 100, raw_json: JSON.stringify({ log: 999, title: "Future unknown", timestamp: 100 }) },
];
const events = new MemoryEvents();
const replay = new ReplayService({ rawLogs: new MemoryRawLogs(rows), events, registry, pageSize: 100 });
const replayed = await replay.replay();
assert.equal(replayed.generated, 1);
assert.equal(replayed.unsupported, 1, "unrecognized raw logs become explicit unsupported processing results");
const replayedAgain = await replay.replay();
assert.equal(replayedAgain.generated, 0, "deterministic event IDs protect duplicate replays");
assert.equal(events.events.size, 1);

const purchaseRegistry = new ParserRegistry();
CoreInventoryParsers.forEach((parser) => purchaseRegistry.register(parser));
const purchaseRows = [
  { source_log_id: "legacy-bazaar", event_timestamp: 200, replay_timestamp: 200, raw_json: JSON.stringify(coreInventoryFixtures.legacyBazaarMultiple) },
  { source_log_id: "abroad", event_timestamp: 201, replay_timestamp: 201, raw_json: JSON.stringify(coreInventoryFixtures.abroadPurchaseMultiple) },
];
const purchaseEvents = new MemoryEvents();
const purchaseReplay = new ReplayService({ rawLogs: new MemoryRawLogs(purchaseRows), events: purchaseEvents, registry: purchaseRegistry, pageSize: 100 });
assert.equal((await purchaseReplay.replay()).generated, 2, "verified legacy purchases replay into canonical events");
assert.equal((await purchaseReplay.replay()).generated, 0, "second legacy-purchase replay is idempotent");
assert.equal(purchaseEvents.events.size, 2);
console.log("Canonical event and replay deterministic tests passed.");
