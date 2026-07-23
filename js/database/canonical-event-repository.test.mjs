import assert from "node:assert/strict";
import { CanonicalEventRepository } from "./canonical-event-repository.js";

class DatabaseMock {
  constructor(){ this.queries = []; this.transactions = []; }
  async query(sql, bind = []){ this.queries.push({ sql, bind }); return []; }
  async transaction(statements){ this.transactions.push(statements); }
}

const database = new DatabaseMock();
const repository = new CanonicalEventRepository(database);
const event = {
  id: "canonical:raw-1:item-receive-gift:1.0.0:0",
  sourceLogId: "raw-1",
  eventTimestamp: 1,
  parserName: "item-receive-gift",
  parserVersion: "1.0.0",
  schemaVersion: 1,
  eventType: "reward",
};
await repository.storeResult({
  sourceLogId: "raw-1",
  parserName: "item-receive-gift",
  parserVersion: "1.0.0",
  supersedesParserNames: ["item-receive-transfer"],
  status: "processed",
  events: [event],
});
const statements = database.transactions[0];
assert.match(statements[0].sql, /DELETE FROM accounting_projections/);
assert.match(statements[0].sql, /SELECT id FROM canonical_events/);
assert.match(statements[0].sql, /parser_name IN/);
assert.match(statements[0].sql, /id NOT IN/);
assert.deepEqual(statements[0].bind, ["raw-1", "item-receive-gift", "item-receive-transfer", event.id]);
assert.match(statements[1].sql, /DELETE FROM canonical_events/);
assert.match(statements[2].sql, /DELETE FROM processing_state/);
assert.ok(statements.some((statement) => /INSERT INTO canonical_events/.test(statement.sql)));
assert.ok(statements.some((statement) => /INSERT INTO processing_state/.test(statement.sql)));

await repository.storeResult({
  sourceLogId: "raw-2",
  parserName: "virus-programming-complete",
  parserVersion: "2.0.0",
  status: "unsupported",
  events: [],
});
assert.doesNotMatch(database.transactions[1][0].sql, /id NOT IN/);
assert.doesNotMatch(database.transactions[1][1].sql, /id NOT IN/);
console.log("Canonical Event replacement persistence tests passed.");
