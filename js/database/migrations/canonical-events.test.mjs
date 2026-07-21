import assert from "node:assert/strict";
import { migration003CanonicalEvents } from "./003-canonical-events.js";

const sql = migration003CanonicalEvents.statements.join("\n");
assert.match(sql, /CREATE TABLE canonical_events/);
assert.match(sql, /canonical_payload_json TEXT NOT NULL/);
assert.match(sql, /CREATE TABLE processing_state/);
assert.match(sql, /PRIMARY KEY\(source_log_id, parser_name, parser_version\)/);
assert.equal(migration003CanonicalEvents.version, 3);
console.log("Canonical event migration deterministic tests passed.");
