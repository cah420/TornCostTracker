import assert from "node:assert/strict";
import { LegacyItemMarketProfileService } from "./legacy-item-market-profile-service.js";
import { coreInventoryFixtures } from "./fixtures/core-inventory-fixtures.js";

const valid = coreInventoryFixtures.legacyItemMarketPurchase;
const rows = [
  { source_log_id: "a", profile_timestamp: 10, raw_json: JSON.stringify(valid) },
  { source_log_id: "b", profile_timestamp: 11, raw_json: JSON.stringify({ ...valid, timestamp: 11, data: { ...valid.data, item: [{ id: 528, qty: 2, uid: null }] } }) },
  { source_log_id: "c", profile_timestamp: 12, raw_json: JSON.stringify({ ...valid, timestamp: 12, data: { ...valid.data, item: [{ id: 528, qty: 1, uid: 1 }, { id: 529, qty: 1, uid: 2 }] } }) },
  { source_log_id: "d", profile_timestamp: 13, raw_json: JSON.stringify({ ...valid, timestamp: 13, data: { ...valid.data, cost: null } }) },
];
class MemoryRawLogs {
  async pageByLogType(logTypeId, { timestamp = null, sourceLogId = null, limit }){
    assert.equal(logTypeId, "1103");
    const start = timestamp === null ? 0 : rows.findIndex((row) => row.profile_timestamp === timestamp && row.source_log_id === sourceLogId) + 1;
    return rows.slice(start, start + limit);
  }
}
const profile = await new LegacyItemMarketProfileService({ rawLogs: new MemoryRawLogs(), pageSize: 2 }).profile();
assert.equal(profile.totalRecords, 4);
assert.equal(profile.acceptedRecords, 1);
assert.equal(profile.rejectedRecords, 3);
assert.equal(profile.parserStatus, "Partially Supported");
assert.equal(profile.recordCoveragePercent, 25);
assert.equal(profile.minimumItemRows, 1);
assert.equal(profile.maximumItemRows, 2);
assert.equal(profile.recordsWithMultipleItemRows, 1);
assert.equal(profile.rowsWithQuantityGreaterThanOne, 1);
assert.equal(profile.rowsWithUid, 4);
assert.equal(profile.rowsWithNullUid, 1);
assert.equal(profile.canonicalEventsGenerated, 1);
assert.equal(profile.acceptedSignatures[0].value, "cost,item,seller");
assert.ok(profile.rejectionReasons.some((entry) => /ambiguous item quantity|unsupported item count|invalid total consideration/i.test(entry.value)));
console.log("Legacy Item Market aggregate profile deterministic tests passed.");
