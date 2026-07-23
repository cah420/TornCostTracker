import { RawLogRepository } from "../../database/raw-log-repository.js";
import { CanonicalEventRepository } from "../../database/canonical-event-repository.js";
import { UnsupportedVariantError } from "./canonical-event.js";

/** Parser-only replay. It produces no acquisitions, lots, conversions, or accounting output. */
export class ReplayService {
  constructor({ rawLogs = new RawLogRepository(), events = new CanonicalEventRepository(), registry, pageSize = 100 } = {}){
    if (!registry) throw new Error("ReplayService requires a ParserRegistry.");
    this.rawLogs = rawLogs; this.events = events; this.registry = registry; this.pageSize = pageSize; this.running = false;
  }

  async replay({ onProgress = null } = {}){
    if (this.running) throw new Error("Canonical replay is already running.");
    this.running = true;
    let timestamp = null; let sourceLogId = null; let replayed = 0; let generated = 0; let unsupported = 0; let errors = 0;
    try {
      while (true) {
        const rows = await this.rawLogs.pageForReplay({ timestamp, sourceLogId, limit: this.pageSize });
        if (!rows.length) break;
        for (const row of rows) {
          const rawLog = JSON.parse(row.raw_json);
          const parsers = this.registry.select(rawLog);
          if (!parsers.length) {
            await this.events.storeResult({ sourceLogId: row.source_log_id, parserName: "registry", parserVersion: "1", status: "unsupported" });
            unsupported += 1;
          } else {
            for (const parser of parsers) {
              try {
                const output = parser.parse({ sourceLogId: row.source_log_id, rawLog, context: { canonicalSchemaVersion: 1 } });
                const stored = await this.events.storeResult({ sourceLogId: row.source_log_id, parserName: parser.name, parserVersion: parser.version, supersedesParserNames: parser.supersedesParserNames ?? [], status: "processed", events: output });
                generated += stored.inserted;
              } catch (error) {
                const status = error instanceof UnsupportedVariantError ? "unsupported" : "error";
                await this.events.storeResult({ sourceLogId: row.source_log_id, parserName: parser.name, parserVersion: parser.version, supersedesParserNames: parser.supersedesParserNames ?? [], status, errorMessage: error.message });
                if (status === "unsupported") unsupported += 1;
                else errors += 1;
              }
            }
          }
          replayed += 1;
          onProgress?.({ status: "running", replayed, generated, unsupported, errors });
        }
        const last = rows.at(-1);
        if (!Number.isFinite(Number(last.replay_timestamp)) || rows.length < this.pageSize) break;
        timestamp = Number(last.replay_timestamp);
        sourceLogId = String(last.source_log_id);
      }
      return { status: "completed", replayed, generated, unsupported, errors };
    } finally { this.running = false; }
  }
}
