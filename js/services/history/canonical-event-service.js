import { Events } from "../../events.js";
import { CanonicalEventRepository } from "../../database/canonical-event-repository.js";
import { RawLogRepository } from "../../database/raw-log-repository.js";
import { ParserRegistry } from "./parser-registry.js";
import { ReplayService } from "./replay-service.js";
import { WalletParser } from "./parsers/wallet-parser.js";
import { BloodBagParser } from "./parsers/blood-bag-parser.js";
import { CoreInventoryParsers } from "./parsers/core-inventory-parsers.js";
import { CoverageIntelligence } from "./coverage-intelligence-service.js";
import { LogTypeCatalog } from "./log-type-catalog-service.js";

export const registry = new ParserRegistry();
registry.register(WalletParser);
registry.register(BloodBagParser);
CoreInventoryParsers.forEach((parser) => registry.register(parser));
LogTypeCatalog.parserRegistry = registry;
CoverageIntelligence.registry = registry;
const repository = new CanonicalEventRepository();
const rawLogs = new RawLogRepository();
const replay = new ReplayService({ registry, events: repository });

export const CanonicalEvents = {
  registry,
  async diagnostics(){ return { ...(await repository.summary()), parserVersions: registry.list(), persistedParserVersions: await repository.listParserVersions(), replayRunning: replay.running }; },
  async coverage(){
    const rows = await rawLogs.parserCoverageRows(); const groups = new Map();
    rows.forEach((row) => {
      const key = `${row.log_type_id}\u0000${row.title}`; const group = groups.get(key) ?? { logTypeId: row.log_type_id, title: row.title, firstSeen: row.event_timestamp, lastSeen: row.event_timestamp, totalArchived: 0, parserNames: new Set(), supported: 0, partial: 0, unsupported: 0, errors: 0, signatures: new Map() };
      const rawLog = JSON.parse(row.raw_json); const signature = Object.keys(rawLog.data ?? {}).sort().join(",") || "none"; group.signatures.set(signature, (group.signatures.get(signature) ?? 0) + 1);
      group.totalArchived += 1; group.firstSeen = Math.min(group.firstSeen, row.event_timestamp); group.lastSeen = Math.max(group.lastSeen, row.event_timestamp);
      const parsers = registry.select(rawLog); parsers.forEach((parser) => group.parserNames.add(`${parser.name}@${parser.version}`));
      if (!parsers.length) group.unsupported += 1;
      else try { parsers.forEach((parser) => parser.parse({ sourceLogId: "coverage", rawLog })); if (parsers.some((parser) => parser.coverageStatus === "partial")) group.partial += 1; else group.supported += 1; }
      catch (error) { if (error.name === "UnsupportedVariantError") group.unsupported += 1; else group.errors += 1; }
      groups.set(key, group);
    });
    const coverage = [...groups.values()].map((group) => ({ ...group, parser: [...group.parserNames].join(", ") || null, status: group.errors ? "Parser Error" : group.partial || (group.supported && group.unsupported) ? "Partially Supported" : group.supported ? "Supported" : "Unsupported", payloadSignature: [...group.signatures.entries()].map(([signature, count]) => `${signature} (${count})`).join(" | ") }));
    const supported = coverage.filter((row) => row.status === "Supported").length;
    const supportedRecords = coverage.filter((row) => row.status === "Supported").reduce((sum, row) => sum + row.totalArchived, 0);
    const totalRecords = coverage.reduce((sum, row) => sum + row.totalArchived, 0);
    return { rows: coverage, supported, unsupported: coverage.filter((row) => row.status === "Unsupported").length, partial: coverage.filter((row) => row.status === "Partially Supported").length, percentage: totalRecords ? Math.round((supportedRecords / totalRecords) * 1000) / 10 : 0 };
  },
  async replay(){
    Events.emit("canonicalReplayProgress", { status: "starting" });
    try {
      const startedAt = Date.now();
      const result = await replay.replay({ onProgress: (update) => Events.emit("canonicalReplayProgress", update) });
      const replayMetrics = { ...result, durationMilliseconds: Date.now() - startedAt };
      try { await CoverageIntelligence.snapshotAfterReplay(replayMetrics); }
      catch (snapshotError) { replayMetrics.snapshotWarning = snapshotError.message; }
      Events.emit("canonicalReplayCompleted", replayMetrics);
      return replayMetrics;
    } catch (error) {
      Events.emit("canonicalReplayFailed", { status: "error", error: error.message });
      throw error;
    }
  },
};
