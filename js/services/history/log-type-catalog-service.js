import { API } from "../../api.js";
import { LogTypeCatalogRepository } from "../../database/log-type-catalog-repository.js";
import { RawLogRepository } from "../../database/raw-log-repository.js";

// This intentionally small, reviewable map is the only classification source.
// Catalog titles never cause a parser or accounting classification to be inferred.
export const LOG_TYPE_CLASSIFICATIONS = Object.freeze({
  "1110": { classification: "Ignored", reason: "Item Market listing lifecycle; not an acquisition." },
  "1111": { classification: "Ignored", reason: "Item Market listing lifecycle; not an acquisition." },
  "1202": { classification: "Ignored", reason: "Bazaar availability lifecycle; not an acquisition." },
  "1222": { classification: "Ignored", reason: "Bazaar listing lifecycle; not an acquisition." },
  "1223": { classification: "Ignored", reason: "Bazaar listing lifecycle; not an acquisition." },
  "1224": { classification: "Ignored", reason: "Bazaar price edit; not an acquisition." },
  "1104": { classification: "Accounting relevant", reason: "Verified legacy Item Market cash-sale shape; parser coverage remains partial until all archived signatures are reviewed." },
  "1113": { classification: "Accounting relevant", reason: "Verified Item Market cash-sale shape; parser coverage remains partial until all archived signatures are reviewed." },
  "1221": { classification: "Accounting relevant", reason: "Verified legacy Bazaar cash-sale shape; parser coverage remains partial until all archived signatures are reviewed." },
  "1226": { classification: "Accounting relevant", reason: "Verified Bazaar cash-sale shape; parser coverage remains partial until all archived signatures are reviewed." },
  "1112": { classification: "Accounting relevant", reason: "Verified Item Market purchase parser." },
  "1220": { classification: "Accounting relevant", reason: "Verified legacy Bazaar purchase shape; parser coverage remains partial until all archived signatures are reviewed." },
  "1225": { classification: "Accounting relevant", reason: "Verified Bazaar purchase parser." },
  "4200": { classification: "Accounting relevant", reason: "City Shop purchase matcher retained pending further verification." },
  "4201": { classification: "Accounting relevant", reason: "Verified Abroad Shop purchase shape; parser coverage remains partial until all archived signatures are reviewed." },
  "4210": { classification: "Accounting relevant", reason: "Verified Item Shop cash-sale shape; parser coverage remains partial until all archived signatures are reviewed." },
  "4401": { classification: "Accounting relevant", reason: "Trade lifecycle coverage is partial; completion is not inferred." },
  "4420": { classification: "Accounting relevant", reason: "Trade lifecycle coverage is partial; completion is not inferred." },
  "4482": { classification: "Accounting relevant", reason: "Trade counterparty offer coverage is partial; completion is not inferred." },
  "6733": { classification: "Accounting relevant", reason: "Verified faction item receipt parser." },
  "7011": { classification: "Accounting relevant", reason: "Verified city item find parser." },
  "9015": { classification: "Accounting relevant", reason: "Verified crime cash reward parser." },
  "9020": { classification: "Accounting relevant", reason: "Verified crime item reward parser." },
  "2405": { classification: "Inventory relevant", reason: "Verified wallet conversion parser." },
  "2340": { classification: "Inventory relevant", reason: "Verified empty blood bag conversion parser." },
  "2350": { classification: "Inventory relevant", reason: "Verified grenade box conversion shape; parser coverage remains partial until all archived signatures are reviewed." },
  "2360": { classification: "Inventory relevant", reason: "Verified medical box conversion shape; parser coverage remains partial until all archived signatures are reviewed." },
  "2407": { classification: "Inventory relevant", reason: "Verified stash box item-to-cash conversion shape; parser coverage remains partial until all archived signatures are reviewed." },
});

function titleHash(title){
  let hash = 2166136261;
  for (const character of String(title)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeCatalog(response){
  const catalog = response?.logtypes ?? response?.logTypes ?? response;
  const entries = Array.isArray(catalog)
    ? catalog.map((value) => [value?.id ?? value?.log_type_id, value])
    : Object.entries(catalog ?? {});
  const records = entries.map(([id, value]) => {
    const title = typeof value === "string" ? value : value?.title ?? value?.name;
    const logTypeId = String(id ?? "").trim();
    if (!logTypeId || !title) throw new Error("Torn returned a log-type catalog record without an ID or title.");
    return { logTypeId, title: String(title), titleHash: titleHash(title) };
  });
  return records.sort((left, right) => Number(left.logTypeId) - Number(right.logTypeId) || left.logTypeId.localeCompare(right.logTypeId));
}

function recordSignature(rawLog){ return Object.keys(rawLog?.data ?? {}).sort().join(",") || "none"; }

function observedStatus(group){
  if (group.errors) return "Parser Error";
  if (group.partial || (group.supported && group.unsupported)) return "Partially Supported";
  if (group.supported) return "Supported";
  return "Unsupported Observed";
}

/** Joins API catalog reference data with observed archive/parser coverage, without changing either. */
export class LogTypeCatalogService {
  constructor({ api = API, catalog = new LogTypeCatalogRepository(), rawLogs = new RawLogRepository(), parserRegistry = { select: () => [] } } = {}){
    this.api = api; this.catalog = catalog; this.rawLogs = rawLogs; this.parserRegistry = parserRegistry;
  }

  async refresh(){
    const response = await this.api.getTornLogTypes();
    const records = normalizeCatalog(response);
    const sourceVersion = response?._metadata?.version ?? response?.metadata?.version ?? null;
    return { ...(await this.catalog.refresh(records, { sourceVersion })), sourceVersion };
  }

  async observedCoverage(){
    const rows = await this.rawLogs.parserCoverageRows(); const groups = new Map();
    rows.forEach((row) => {
      const logTypeId = String(row.log_type_id); const group = groups.get(logTypeId) ?? {
      logTypeId, observedTitle: row.title, firstSeen: row.event_timestamp, lastSeen: row.event_timestamp,
        observedCount: 0, parserNames: new Set(), supported: 0, partial: 0, unsupported: 0, errors: 0, signatures: new Map(),
      };
      const rawLog = JSON.parse(row.raw_json); const signature = recordSignature(rawLog);
      group.observedCount += 1; group.firstSeen = Math.min(group.firstSeen, row.event_timestamp); group.lastSeen = Math.max(group.lastSeen, row.event_timestamp);
      const parsers = this.parserRegistry.select(rawLog); parsers.forEach((parser) => group.parserNames.add(`${parser.name}@${parser.version}`));
      let signatureStatus = "unsupported";
      if (!parsers.length) group.unsupported += 1;
      else try {
        parsers.forEach((parser) => parser.parse({ sourceLogId: "coverage", rawLog }));
        if (parsers.some((parser) => parser.coverageStatus === "partial")) { group.partial += 1; signatureStatus = "partial"; } else { group.supported += 1; signatureStatus = "supported"; }
      } catch (error) { if (error.name === "UnsupportedVariantError") group.unsupported += 1; else { group.errors += 1; signatureStatus = "error"; } }
      const signatureMetrics = group.signatures.get(signature) ?? { observed: 0, supported: 0, partial: 0, unsupported: 0, errors: 0 };
      signatureMetrics.observed += 1;
      if (signatureStatus === "supported") signatureMetrics.supported += 1;
      else if (signatureStatus === "partial") signatureMetrics.partial += 1;
      else if (signatureStatus === "error") signatureMetrics.errors += 1;
      else signatureMetrics.unsupported += 1;
      group.signatures.set(signature, signatureMetrics);
      groups.set(logTypeId, group);
    });
    return groups;
  }

  async coverage({ search = "", status = "all", view = "catalog" } = {}){
    const [catalogRows, observed] = await Promise.all([this.catalog.list(), this.observedCoverage()]);
    const catalogIds = new Set(catalogRows.map((row) => String(row.log_type_id)));
    const rows = catalogRows.map((catalog) => this.coverageRow(catalog, observed.get(String(catalog.log_type_id))));
    observed.forEach((group, logTypeId) => { if (!catalogIds.has(logTypeId)) rows.push(this.coverageRow({ log_type_id: logTypeId, title: group.observedTitle, active: false }, group)); });
    const query = String(search).trim().toLowerCase();
    const filtered = rows.filter((row) => (!query || `${row.logTypeId} ${row.title}`.toLowerCase().includes(query)) && (status === "all" || row.status === status));
    const observedRows = rows.filter((row) => row.observedCount > 0);
    const supportedRecords = observedRows.filter((row) => row.status === "Supported").reduce((sum, row) => sum + row.observedCount, 0);
    const observedRecords = observedRows.reduce((sum, row) => sum + row.observedCount, 0);
    const relevance = { "Accounting relevant": 0, "Inventory relevant": 1, Unclassified: 2, Ignored: 3 };
    const urgency = { "Parser Error": 0, "Unsupported Observed": 1, "Partially Supported": 2, "Awaiting Sample": 3, Legacy: 4, Supported: 5, Ignored: 6 };
    const sorted = filtered.sort((left, right) => view === "roadmap"
      ? right.observedCount - left.observedCount || (relevance[left.classification] ?? 9) - (relevance[right.classification] ?? 9) || (urgency[left.status] ?? 9) - (urgency[right.status] ?? 9) || (right.lastSeen ?? 0) - (left.lastSeen ?? 0) || Number(left.logTypeId) - Number(right.logTypeId)
      : Number(left.logTypeId) - Number(right.logTypeId) || left.logTypeId.localeCompare(right.logTypeId));
    return {
      rows: sorted,
      totals: { catalog: catalogRows.length, observedTypes: observedRows.length, observedRecords, supportedRecords, coveragePercent: observedRecords ? Math.round((supportedRecords / observedRecords) * 1000) / 10 : 0 },
    };
  }

  coverageRow(catalog, group = null){
    const metadata = LOG_TYPE_CLASSIFICATIONS[String(catalog.log_type_id)] ?? { classification: "Unclassified", reason: "No manual accounting relevance classification yet." };
    let status = !group ? "Awaiting Sample" : observedStatus(group);
    if (metadata.classification === "Ignored") status = "Ignored";
    else if (group && !catalog.active) status = "Legacy";
    return {
      logTypeId: String(catalog.log_type_id), title: catalog.title, active: Boolean(catalog.active), status,
      classification: metadata.classification, classificationReason: metadata.reason,
      observedCount: group?.observedCount ?? 0, firstSeen: group?.firstSeen ?? null, lastSeen: group?.lastSeen ?? null,
      parser: group ? [...group.parserNames].join(", ") || null : null,
      payloadSignatures: group ? [...group.signatures.entries()].map(([signature, metrics]) => `${signature} (${metrics.observed})`).join(" | ") : "none",
      observedSignatures: group ? group.signatures.size : 0,
      supportedSignatures: group ? [...group.signatures.values()].filter((metrics) => metrics.supported > 0 && !metrics.partial && !metrics.unsupported && !metrics.errors).length : 0,
      partialSignatures: group ? [...group.signatures.values()].filter((metrics) => metrics.partial > 0).length : 0,
      unsupportedSignatures: group ? [...group.signatures.values()].filter((metrics) => metrics.unsupported > 0 || metrics.errors > 0).length : 0,
    };
  }
}

export const LogTypeCatalog = new LogTypeCatalogService();
export { normalizeCatalog, titleHash };
