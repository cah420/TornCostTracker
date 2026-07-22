import { CanonicalEventRepository } from "../../database/canonical-event-repository.js";
import { CoverageSnapshotRepository } from "../../database/coverage-snapshot-repository.js";
import { RawLogRepository } from "../../database/raw-log-repository.js";
import { LogTypeCatalog } from "./log-type-catalog-service.js";
import { LegacyItemMarketProfiler } from "./legacy-item-market-profile-service.js";

function number(value){ const result = Number(value); return Number.isFinite(result) ? result : 0; }
function percent(part, total){ return total ? Math.round((part / total) * 1000) / 10 : 0; }
function familyFor(row, parserFamilies){
  const families = String(row.parser ?? "").split(", ").filter(Boolean).map((entry) => parserFamilies.get(entry.split("@")[0]) ?? "Unclassified");
  return [...new Set(families)].join(" / ") || "Unsupported";
}

/** Read-only aggregate diagnostics. New contributors can add metrics without changing replay or parsers. */
export class CoverageIntelligenceService {
  constructor({ catalog = LogTypeCatalog, rawLogs = new RawLogRepository(), events = new CanonicalEventRepository(), snapshots = new CoverageSnapshotRepository(), registry = { list: () => [] }, legacyItemMarketProfiler = null } = {}){
    this.catalog = catalog; this.rawLogs = rawLogs; this.events = events; this.snapshots = snapshots; this.registry = registry; this.legacyItemMarketProfiler = legacyItemMarketProfiler;
  }
  async dashboard({ includeLegacyItemMarketProfile = false } = {}){
    const [coverage, archive, latestRun, eventSummary, eventTypes, eventCounts, snapshots, legacyItemMarketProfile] = await Promise.all([
      this.catalog.coverage({ view: "roadmap" }), this.rawLogs.archiveSummary(), this.rawLogs.getLatestRun(), this.events.summary(), this.events.eventTypeCounts(), this.events.eventCountsByLogType(), this.snapshots.list({ limit: 2 }), includeLegacyItemMarketProfile && this.legacyItemMarketProfiler ? this.legacyItemMarketProfiler.profile() : Promise.resolve(null),
    ]);
    const rows = coverage.rows.filter((row) => row.observedCount > 0);
    const full = rows.filter((row) => row.status === "Supported"); const partial = rows.filter((row) => row.status === "Partially Supported");
    const unsupported = rows.filter((row) => ["Unsupported Observed", "Parser Error", "Legacy"].includes(row.status));
    const fullRecords = full.reduce((sum, row) => sum + row.observedCount, 0); const partialRecords = partial.reduce((sum, row) => sum + row.observedCount, 0);
    const observedSignatures = rows.reduce((sum, row) => sum + row.observedSignatures, 0);
    const fullSignatures = rows.reduce((sum, row) => sum + row.supportedSignatures, 0); const partialSignatures = rows.reduce((sum, row) => sum + row.partialSignatures, 0); const unsupportedSignatures = rows.reduce((sum, row) => sum + row.unsupportedSignatures, 0);
    const registeredParsers = this.registry.list();
    const parserFamilies = new Map(registeredParsers.map((parser) => [parser.name, parser.family]));
    const parserCounts = new Map();
    registeredParsers.forEach((parser) => {
      const family = parser.family ?? "Unclassified";
      parserCounts.set(family, (parserCounts.get(family) ?? 0) + 1);
    });
    const canonicalEventsByType = new Map(eventCounts.map((row) => [String(row.log_type_id), number(row.canonical_events)]));
    const families = new Map();
    parserCounts.forEach((parserCount, family) => families.set(family, { family, parserCount, observedTypes: 0, fullTypes: 0, partialTypes: 0, observedRecords: 0, canonicalEvents: 0 }));
    rows.forEach((row) => {
      const family = familyFor(row, parserFamilies); const summary = families.get(family) ?? { family, parserCount: 0, observedTypes: 0, fullTypes: 0, partialTypes: 0, observedRecords: 0, canonicalEvents: 0 };
      summary.observedTypes += 1; summary.fullTypes += row.status === "Supported" ? 1 : 0; summary.partialTypes += row.status === "Partially Supported" ? 1 : 0; summary.observedRecords += row.observedCount; summary.canonicalEvents += canonicalEventsByType.get(row.logTypeId) ?? 0; families.set(family, summary);
    });
    const metrics = {
      observedTypes: rows.length, fullySupportedTypes: full.length, partiallySupportedTypes: partial.length, unsupportedTypes: unsupported.length,
      observedRecords: coverage.totals.observedRecords, fullySupportedRecords: fullRecords, partiallySupportedRecords: partialRecords, supportedRecords: fullRecords + partialRecords, unsupportedRecords: Math.max(0, coverage.totals.observedRecords - fullRecords - partialRecords),
      observedSignatures, fullySupportedSignatures: fullSignatures, partiallySupportedSignatures: partialSignatures, supportedSignatures: fullSignatures + partialSignatures, unsupportedSignatures,
      canonicalEvents: eventSummary.canonicalEvents, parserCount: registeredParsers.length, canonicalEventTypes: eventTypes.length,
    };
    const latest = snapshots[0] ?? null; const previous = snapshots[1] ?? null;
    const health = {
      archiveIntegrity: archive.conflictCount ? "Warning: conflicts present" : "Healthy",
      rawWarehouse: latestRun?.status === "failed" ? "Needs Attention: import failed" : latestRun?.status === "paused" ? "Warning: import paused" : "Healthy",
      replay: eventSummary.errors ? "Needs Attention: parser errors" : "Deterministic",
      coverage: previous && metrics.supportedRecords < number(previous.metrics?.supportedRecords) ? "Warning: supported-record coverage decreased" : "Healthy",
      signatures: unsupportedSignatures ? "Warning: unsupported signatures observed" : "Healthy",
    };
    const familyRows = [...families.values()].map((family) => ({ ...family, coveragePercent: percent(family.observedRecords, metrics.observedRecords) })).sort((left, right) => right.observedRecords - left.observedRecords || left.family.localeCompare(right.family));
    const impactRows = [...rows].sort((left, right) => right.observedCount - left.observedCount || left.logTypeId.localeCompare(right.logTypeId)).map((row) => ({ ...row, family: familyFor(row, parserFamilies), canonicalEvents: canonicalEventsByType.get(row.logTypeId) ?? 0, archivePercent: percent(row.observedCount, metrics.observedRecords) }));
    const needsCoverage = new Set(["Partially Supported", "Unsupported Observed", "Parser Error", "Legacy"]);
    const legacyItemMarket = legacyItemMarketProfile ? { ...legacyItemMarketProfile, generatedCanonicalEvents: canonicalEventsByType.get("1103") ?? 0 } : null;
    return { metrics, health, families: familyRows, highestImpactUnsupported: impactRows.filter((row) => needsCoverage.has(row.status)).slice(0, 25), signatures: impactRows, latestSnapshot: latest, previousSnapshot: previous, archive, latestRun, eventTypes, legacyItemMarket };
  }
  async snapshotAfterReplay(replay){
    const dashboard = await this.dashboard({ includeLegacyItemMarketProfile: true });
    const metrics = { ...dashboard.metrics, replayDurationMilliseconds: replay.durationMilliseconds ?? null, replayed: replay.replayed, generated: replay.generated, unsupported: replay.unsupported, errors: replay.errors, duplicatesPrevented: replay.duplicatesPrevented ?? 0 };
    return this.snapshots.save({ metrics, replay });
  }
}

export const CoverageIntelligence = new CoverageIntelligenceService({ legacyItemMarketProfiler: LegacyItemMarketProfiler });
