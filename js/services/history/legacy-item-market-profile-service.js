import { RawLogRepository } from "../../database/raw-log-repository.js";
import { UnsupportedVariantError } from "./canonical-event.js";
import { LegacyItemMarketPurchaseParser } from "./parsers/legacy-item-market-purchase-parser.js";

const LOG_TYPE_ID = "1103";

function increment(map, key){ map.set(key, (map.get(key) ?? 0) + 1); }
function entries(map){ return [...map.entries()].map(([value, count]) => ({ value, count })).sort((left, right) => right.count - left.count || String(left.value).localeCompare(String(right.value))); }
function fields(value){ return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort().join(",") || "none" : "invalid"; }
function typeOf(value){ return value === null ? "null" : Array.isArray(value) ? "array" : typeof value; }
function finitePositiveInteger(value){ return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0; }
function profileRecord(rawLog, profile){
  const data = rawLog?.data;
  increment(profile.topLevelSignatures, fields(data));
  const timestamp = Number(rawLog?.timestamp);
  if (Number.isFinite(timestamp)) { profile.earliestTimestamp = profile.earliestTimestamp === null ? timestamp : Math.min(profile.earliestTimestamp, timestamp); profile.latestTimestamp = profile.latestTimestamp === null ? timestamp : Math.max(profile.latestTimestamp, timestamp); }
  const item = data?.item;
  increment(profile.itemShapes, typeOf(item));
  if (Array.isArray(item)) {
    profile.minimumItemRows = profile.minimumItemRows === null ? item.length : Math.min(profile.minimumItemRows, item.length);
    profile.maximumItemRows = Math.max(profile.maximumItemRows, item.length);
    if (item.length > 1) profile.recordsWithMultipleItemRows += 1;
    const itemIds = new Set(); const uids = new Set();
    item.forEach((row) => {
      increment(profile.itemRowFields, fields(row));
      const quantity = row?.qty ?? row?.quantity ?? row?.amount;
      if (finitePositiveInteger(quantity) && quantity > 1) profile.rowsWithQuantityGreaterThanOne += 1;
      if (!finitePositiveInteger(row?.id ?? row?.item_id)) profile.invalidItemRows += 1;
      const itemId = row?.id ?? row?.item_id;
      if (finitePositiveInteger(itemId)) { if (itemIds.has(itemId)) profile.recordsWithDuplicateItemIds += 1; itemIds.add(itemId); }
      if (Object.hasOwn(row ?? {}, "uid")) {
        if (row.uid === null) profile.rowsWithNullUid += 1;
        else if (typeof row.uid === "number" || typeof row.uid === "string") { profile.rowsWithUid += 1; if (uids.has(String(row.uid))) profile.recordsWithDuplicateUids += 1; uids.add(String(row.uid)); }
        else profile.rowsWithInvalidUid += 1;
      } else profile.rowsWithoutUid += 1;
    });
  } else profile.malformedStructures += 1;
  if (!data || !Object.hasOwn(data, "seller")) profile.sellerMissing += 1;
  else { increment(profile.sellerShapes, typeOf(data.seller)); if (data.seller === null) profile.sellerNull += 1; }
  if (!data || !Object.hasOwn(data, "cost")) profile.costMissing += 1;
  else {
    increment(profile.costTypes, typeOf(data.cost));
    if (data.cost === null) profile.costNull += 1;
    else if (typeof data.cost === "number" && Number.isFinite(data.cost) && data.cost > 0) { profile.minimumCost = profile.minimumCost === null ? data.cost : Math.min(profile.minimumCost, data.cost); profile.maximumCost = profile.maximumCost === null ? data.cost : Math.max(profile.maximumCost, data.cost); }
    else profile.invalidCost += 1;
  }
}

/** Aggregate-only profiler for 1103. It never returns raw rows or participant identifiers. */
export class LegacyItemMarketProfileService {
  constructor({ rawLogs = new RawLogRepository(), parser = LegacyItemMarketPurchaseParser, pageSize = 500 } = {}){ this.rawLogs = rawLogs; this.parser = parser; this.pageSize = pageSize; }
  async profile(){
    const profile = { logTypeId: LOG_TYPE_ID, totalRecords: 0, acceptedRecords: 0, rejectedRecords: 0, earliestTimestamp: null, latestTimestamp: null, topLevelSignatures: new Map(), itemShapes: new Map(), itemRowFields: new Map(), minimumItemRows: null, maximumItemRows: 0, recordsWithMultipleItemRows: 0, rowsWithQuantityGreaterThanOne: 0, rowsWithUid: 0, rowsWithNullUid: 0, rowsWithoutUid: 0, rowsWithInvalidUid: 0, recordsWithDuplicateItemIds: 0, recordsWithDuplicateUids: 0, invalidItemRows: 0, sellerShapes: new Map(), sellerMissing: 0, sellerNull: 0, costTypes: new Map(), costMissing: 0, costNull: 0, minimumCost: null, maximumCost: null, invalidCost: 0, malformedStructures: 0, rejectionReasons: new Map(), acceptedSignatures: new Map(), rejectedSignatures: new Map() };
    let timestamp = null; let sourceLogId = null;
    while (true) {
      const rows = await this.rawLogs.pageByLogType(LOG_TYPE_ID, { timestamp, sourceLogId, limit: this.pageSize });
      if (!rows.length) break;
      for (const row of rows) {
        const rawLog = JSON.parse(row.raw_json); const signature = fields(rawLog?.data); profile.totalRecords += 1; profileRecord(rawLog, profile);
        try { this.parser.parse({ sourceLogId: row.source_log_id, rawLog }); profile.acceptedRecords += 1; increment(profile.acceptedSignatures, signature); }
        catch (error) { profile.rejectedRecords += 1; increment(profile.rejectedSignatures, signature); increment(profile.rejectionReasons, error instanceof UnsupportedVariantError ? error.message : "Parser error"); }
      }
      const last = rows.at(-1); timestamp = Number(last.profile_timestamp); sourceLogId = String(last.source_log_id);
      if (rows.length < this.pageSize) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const status = !profile.totalRecords ? "Awaiting Sample" : !profile.rejectedRecords ? "Supported" : profile.acceptedRecords ? "Partially Supported" : "Unsupported Observed";
    return { ...profile, parserStatus: status, recordCoveragePercent: profile.totalRecords ? Math.round((profile.acceptedRecords / profile.totalRecords) * 1000) / 10 : 0, canonicalEventsGenerated: profile.acceptedRecords, topLevelSignatures: entries(profile.topLevelSignatures), itemShapes: entries(profile.itemShapes), itemRowFields: entries(profile.itemRowFields), sellerShapes: entries(profile.sellerShapes), costTypes: entries(profile.costTypes), rejectionReasons: entries(profile.rejectionReasons), acceptedSignatures: entries(profile.acceptedSignatures), rejectedSignatures: entries(profile.rejectedSignatures) };
  }
}

export const LegacyItemMarketProfiler = new LegacyItemMarketProfileService();
