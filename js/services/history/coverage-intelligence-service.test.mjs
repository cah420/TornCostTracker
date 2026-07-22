import assert from "node:assert/strict";
import { CoverageIntelligenceService } from "./coverage-intelligence-service.js";
const service = new CoverageIntelligenceService({
  catalog: { async coverage(){ return { totals: { observedRecords: 10 }, rows: [
    { logTypeId: "1", title: "Supported", status: "Supported", observedCount: 6, observedSignatures: 1, supportedSignatures: 1, partialSignatures: 0, unsupportedSignatures: 0, parser: "acquisition@1" },
    { logTypeId: "2", title: "Partial", status: "Partially Supported", observedCount: 3, observedSignatures: 2, supportedSignatures: 0, partialSignatures: 1, unsupportedSignatures: 1, parser: "trade@1" },
    { logTypeId: "3", title: "Unknown", status: "Unsupported Observed", observedCount: 1, observedSignatures: 1, supportedSignatures: 0, partialSignatures: 0, unsupportedSignatures: 1, parser: null },
  ] }; } },
  rawLogs: { async archiveSummary(){ return { conflictCount: 0 }; }, async getLatestRun(){ return { status: "completed" }; } },
  events: { async summary(){ return { canonicalEvents: 9, errors: 0 }; }, async eventTypeCounts(){ return [{ event_type: "acquisition", count: 6 }, { event_type: "transfer", count: 3 }]; }, async eventCountsByLogType(){ return [{ log_type_id: "1", canonical_events: 6 }, { log_type_id: "2", canonical_events: 3 }]; } },
  snapshots: { async list(){ return []; }, async save(snapshot){ return snapshot; } },
  registry: { list(){ return [{ name: "acquisition", family: "Acquisition" }, { name: "trade", family: "Transfer" }]; } },
  legacyItemMarketProfiler: { async profile(){ return { totalRecords: 7, acceptedRecords: 7, rejectedRecords: 0, parserStatus: "Supported" }; } },
});
const dashboard = await service.dashboard({ includeLegacyItemMarketProfile: true });
assert.equal(dashboard.metrics.supportedRecords, 9);
assert.equal(dashboard.metrics.unsupportedRecords, 1);
assert.equal(dashboard.health.archiveIntegrity, "Healthy");
assert.equal(dashboard.highestImpactUnsupported[0].logTypeId, "2");
assert.equal(dashboard.families.find((family) => family.family === "Transfer").canonicalEvents, 3);
assert.equal(dashboard.families.find((family) => family.family === "Transfer").parserCount, 1);
assert.equal(dashboard.legacyItemMarket.generatedCanonicalEvents, 0);
assert.equal(dashboard.legacyItemMarket.parserStatus, "Supported");
const snapshot = await service.snapshotAfterReplay({ replayed: 10, generated: 9, unsupported: 1, errors: 0, durationMilliseconds: 1000 });
assert.equal(snapshot.metrics.parserCount, 2);

const warningService = new CoverageIntelligenceService({
  catalog: service.catalog,
  rawLogs: { async archiveSummary(){ return { conflictCount: 1 }; }, async getLatestRun(){ return { status: "failed" }; } },
  events: { async summary(){ return { canonicalEvents: 9, errors: 1 }; }, async eventTypeCounts(){ return []; }, async eventCountsByLogType(){ return []; } },
  snapshots: { async list(){ return [{ metrics: { supportedRecords: 9 }, replay: {} }, { metrics: { supportedRecords: 10 }, replay: {} }]; } },
  registry: service.registry,
});
const warningDashboard = await warningService.dashboard();
assert.match(warningDashboard.health.archiveIntegrity, /Warning/);
assert.match(warningDashboard.health.rawWarehouse, /Needs Attention/);
assert.match(warningDashboard.health.replay, /Needs Attention/);
assert.match(warningDashboard.health.coverage, /Warning/);
console.log("Coverage intelligence deterministic tests passed.");
