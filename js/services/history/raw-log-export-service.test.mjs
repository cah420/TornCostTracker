import assert from "node:assert/strict";
import { RawLogRedactor } from "./raw-log-redactor.js";
import { RawLogExportService, exportFilename, validateExportFilters } from "./raw-log-export-service.js";

const sourceRows = [
  { source_log_id: "a", event_timestamp: 10, log_type_id: "2405", category: "Items", title: "Item use wallet", raw_json: JSON.stringify({ log: 2405, timestamp: 10, data: { item: 1, quantity: 2, sender: 55, sender_name: "Alice", api_key: "never-share", message: "private", description: "private note", reason: "private reason", item_name: "Wallet" } }), payload_hash: "a", imported_at: 1, first_seen_at: 1, last_seen_at: 1 },
  { source_log_id: "b", event_timestamp: 11, log_type_id: "2340", category: "Items", title: "Item use empty blood bag", raw_json: JSON.stringify({ log: 2340, timestamp: 11, data: { item: 2, quantity: 1, sender: 55, item_name: "Blood Bag" } }), payload_hash: "b", imported_at: 1, first_seen_at: 1, last_seen_at: 1 },
  { source_log_id: "c", event_timestamp: 12, log_type_id: "999", category: "Other", title: "Unknown", raw_json: JSON.stringify({ log: 999, timestamp: 12 }), payload_hash: "c", imported_at: 1, first_seen_at: 1, last_seen_at: 1 },
];
class MemoryRepository {
  constructor(){ this.pages = 0; this.rows = structuredClone(sourceRows); }
  async countForExport(filters){ return this.rows.filter((row) => (!filters.logTypeIds.length || filters.logTypeIds.includes(row.log_type_id)) && (!filters.category || row.category === filters.category) && (!filters.titleSearch || row.title.toLowerCase().includes(filters.titleSearch.toLowerCase())) && (!filters.sourceLogId || row.source_log_id === filters.sourceLogId)).length; }
  async pageForExport(filters, { cursor, limit }){
    this.pages += 1;
    const filtered = this.rows.filter((row) => (!filters.logTypeIds.length || filters.logTypeIds.includes(row.log_type_id)) && (!filters.category || row.category === filters.category) && (!filters.titleSearch || row.title.toLowerCase().includes(filters.titleSearch.toLowerCase())) && (!filters.sourceLogId || row.source_log_id === filters.sourceLogId));
    const ordered = [...filtered].sort((a, b) => filters.sortOrder === "newest" ? b.event_timestamp - a.event_timestamp : a.event_timestamp - b.event_timestamp);
    const start = cursor ? ordered.findIndex((row) => row.source_log_id === cursor.sourceLogId) + 1 : 0;
    return ordered.slice(start, start + limit);
  }
}
const filters = validateExportFilters({ logTypeIds: "2405, 2340", category: "Items", titleSearch: "item", maximum: "2", sortOrder: "oldest" });
assert.deepEqual(filters.logTypeIds, ["2405", "2340"]);
assert.throws(() => validateExportFilters({ fromTimestamp: 2, toTimestamp: 1 }), /From date/);
const repository = new MemoryRepository();
const exporter = new RawLogExportService({ repository, pageSize: 1 });
const result = await exporter.export({ filters, redactionMode: "redacted" });
const lines = (await result.blob.text()).trim().split("\n").map(JSON.parse);
assert.equal(lines[0]._recordType, "export_metadata");
assert.equal(lines.length, 3, "metadata plus maximum filtered records");
assert.equal(lines[1].sourceLogId, "a", "ordering is deterministic");
assert.equal(lines[1].raw.data.item, 1, "mechanic item IDs remain intact");
assert.equal(lines[1].raw.data.sender, lines[2].raw.data.sender, "identifiers use stable per-export pseudonyms");
assert.equal(lines[1].raw.data.api_key, "[redacted]");
assert.equal(lines[1].raw.data.message, "[redacted]");
assert.equal(lines[1].raw.data.description, "[redacted]");
assert.equal(lines[1].raw.data.reason, "[redacted]");
assert.equal(JSON.parse(repository.rows[0].raw_json).data.sender, 55, "redaction never mutates archived source data");
assert.ok(repository.pages >= 2, "large exports are requested in multiple pages");
assert.match(exportFilename(filters, "redacted"), /^torn-raw-logs-redacted-archive-/);
assert.doesNotMatch(result.filename, /never-share|55/);
console.log("Raw-log export deterministic tests passed.");
