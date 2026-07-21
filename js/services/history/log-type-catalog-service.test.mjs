import assert from "node:assert/strict";
import { LogTypeCatalogService, normalizeCatalog } from "./log-type-catalog-service.js";

assert.deepEqual(normalizeCatalog({ logtypes: { 2: "Two", 1: "One" } }).map((row) => row.logTypeId), ["1", "2"]);
const service = new LogTypeCatalogService({
  api: { async getTornLogTypes(){ return { logtypes: {} }; } },
  catalog: { async list(){ return [
    { log_type_id: "1112", title: "Item market buy", active: 1 },
    { log_type_id: "5000", title: "No sample", active: 1 },
    { log_type_id: "1222", title: "Bazaar add", active: 1 },
  ]; } },
  rawLogs: { async parserCoverageRows(){ return [
    { log_type_id: "1112", title: "Item market buy", event_timestamp: 10, raw_json: JSON.stringify({ log: 1112, title: "Item market buy", data: { items: [] } }) },
    { log_type_id: "9999", title: "Legacy row", event_timestamp: 9, raw_json: JSON.stringify({ log: 9999, title: "Legacy row", data: {} }) },
  ]; } },
  parserRegistry: { select(raw){ return raw.log === 1112 ? [{ name: "market", version: "1", parse(){}, coverageStatus: "complete" }] : []; } },
});
const coverage = await service.coverage();
assert.equal(coverage.rows.find((row) => row.logTypeId === "1112").status, "Supported");
assert.equal(coverage.rows.find((row) => row.logTypeId === "5000").status, "Awaiting Sample");
assert.equal(coverage.rows.find((row) => row.logTypeId === "1222").status, "Ignored");
assert.equal(coverage.rows.find((row) => row.logTypeId === "9999").status, "Legacy");
const roadmap = await service.coverage({ view: "roadmap" });
assert.equal(roadmap.rows[0].logTypeId, "1112", "roadmap prioritizes observed accounting-relevant parser work deterministically");
console.log("Torn log-type catalog coverage deterministic tests passed.");
