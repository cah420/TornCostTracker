/**
 * Contracts deliberately contain no persistence or SQL details. LocalStorage
 * adapters remain active until a repository is migrated and validated.
 */
export const RepositoryContracts = Object.freeze({
  rawLogs: ["insertBatch", "getBySourceLogId", "pageChronologically", "getImportSummary"],
  syncCheckpoints: ["get", "save"],
  logImportRuns: ["start", "update", "getLatest"],
  canonicalEvents: ["storeResult", "summary", "listBySourceLogId"],
  processingState: ["get", "record"],
  tornLogTypes: ["list", "refresh", "listChanges"],
  acquisitions: ["upsert", "listByItem"],
  costLots: ["listOpen", "replaceTransactionally"],
  conversions: ["append", "listNewestFirst"],
  marketValues: ["upsertObservations", "findLatest"],
});
