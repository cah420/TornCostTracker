import { Database } from "./database-client.js";
import { stableStringify } from "../services/raw-log-serialization.js";

const EVIDENCE_PARSERS = Object.freeze([
  "trade-completed-evidence",
  "trade-money-outgoing-evidence",
  "trade-money-incoming-evidence",
  "trade-items-outgoing-evidence",
  "trade-items-incoming",
]);
function placeholders(values){ return values.map(() => "?").join(","); }
function parseResolution(row){
  if (!row) return null;
  return {
    id: row.id,
    sourceTransactionId: String(row.source_transaction_id),
    resolutionVersion: Number(row.resolution_version),
    schemaVersion: Number(row.schema_version),
    resolverVersion: row.resolver_version,
    accountingPolicyVersion: Number(row.accounting_policy_version),
    status: row.status,
    resolutionMethod: row.resolution_method,
    totalGrossProceeds: Number(row.total_gross_proceeds),
    totalFees: Number(row.total_fees),
    totalNetProceeds: Number(row.total_net_proceeds),
    allocations: JSON.parse(row.allocations_json),
    evidenceHash: row.evidence_hash,
    completionSourceLogId: row.completion_source_log_id,
    counterpartyId: row.counterparty_id,
    transactionTimestamp: Number(row.transaction_timestamp),
    supersedesResolutionId: row.supersedes_resolution_id,
    isActive: Boolean(row.is_active),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    resolvedAt: Number(row.resolved_at),
  };
}
function staleStatements(entityId, now, reason = "disposal_resolution_changed"){
  return ["accounting_projection", "accounting_ledger", "cost_lots", "fifo", "inventory_position"].map((layer) => ({
    sql: `INSERT INTO accounting_rebuild_state (layer, stale_since, reason, source_entity_id) VALUES (?, ?, ?, ?)
      ON CONFLICT(layer) DO UPDATE SET stale_since=excluded.stale_since, reason=excluded.reason, source_entity_id=excluded.source_entity_id`,
    bind: [layer, now, reason, entityId],
  }));
}

/** SQLite boundary for immutable, versioned Disposal Resolution revisions. */
export class DisposalResolutionRepository {
  constructor(database = Database){ this.database = database; }
  async listEvidence(){
    const rows = await this.database.query(`SELECT canonical_payload_json FROM canonical_events WHERE parser_name IN (${placeholders(EVIDENCE_PARSERS)}) ORDER BY event_timestamp ASC, id ASC`, EVIDENCE_PARSERS);
    return rows.map((row) => JSON.parse(row.canonical_payload_json));
  }
  async activeForTransaction(sourceTransactionId){
    const rows = await this.database.query("SELECT * FROM disposal_resolutions WHERE source_transaction_id = ? AND is_active = 1 LIMIT 1", [String(sourceTransactionId)]);
    return parseResolution(rows[0]);
  }
  async historyForTransaction(sourceTransactionId){
    const rows = await this.database.query("SELECT * FROM disposal_resolutions WHERE source_transaction_id = ? ORDER BY resolution_version DESC", [String(sourceTransactionId)]);
    return rows.map(parseResolution);
  }
  async listActive(){
    const rows = await this.database.query("SELECT * FROM disposal_resolutions WHERE is_active = 1 ORDER BY transaction_timestamp DESC, source_transaction_id DESC");
    return rows.map(parseResolution);
  }
  async contextSummary(fifoVersion){
    const [conversionRows, unsupportedRows, fifoRows] = await Promise.all([
      this.database.query("SELECT COUNT(*) AS count FROM canonical_events WHERE parser_name IN ('crime-skimming-conversion-input', 'museum-exchange-review', 'crime-blank-dvds-review', 'crime-spray-can-review')"),
      this.database.query("SELECT COUNT(*) AS count FROM canonical_events WHERE parser_name IN ('museum-exchange-review', 'crime-blank-dvds-review', 'crime-spray-can-review')"),
      this.database.query("SELECT COUNT(*) AS count FROM accounting_fifo_disposal_demands WHERE fifo_version = ? AND (unmatched_quantity > 0 OR demand_status IN ('unresolved', 'fifo_error'))", [fifoVersion]),
    ]);
    return {
      conversionCandidates: Number(conversionRows[0]?.count) || 0,
      unsupported: Number(unsupportedRows[0]?.count) || 0,
      fifoExceptions: Number(fifoRows[0]?.count) || 0,
    };
  }
  async markNeedsReview(resolutionId, reason = "disposal_evidence_changed", now = Date.now()){
    await this.database.transaction([
      { sql: "UPDATE disposal_resolutions SET status = 'needs_review', updated_at = ? WHERE id = ? AND is_active = 1 AND status <> 'needs_review'", bind: [now, resolutionId] },
      ...staleStatements(resolutionId, now, reason),
    ]);
  }
  async saveRevision(resolution, canonicalEvents, { previous = null, derivedVersions = null } = {}){
    const now = resolution.updatedAt; const statements = [];
    if (derivedVersions) {
      const { projection, ledger, costLot, fifo, position } = derivedVersions;
      statements.push(
        { sql: "DELETE FROM accounting_inventory_position_diagnostics WHERE position_version = ?", bind: [position] },
        { sql: "DELETE FROM accounting_inventory_positions WHERE position_version = ?", bind: [position] },
        { sql: "DELETE FROM accounting_inventory_position_runs WHERE position_version = ?", bind: [position] },
        { sql: "DELETE FROM accounting_realized_results WHERE fifo_version = ?", bind: [fifo] },
        { sql: "DELETE FROM accounting_fifo_consumptions WHERE fifo_version = ?", bind: [fifo] },
        { sql: "DELETE FROM accounting_fifo_diagnostics WHERE fifo_version = ?", bind: [fifo] },
        { sql: "DELETE FROM accounting_fifo_dispositions WHERE fifo_version = ?", bind: [fifo] },
        { sql: "DELETE FROM accounting_fifo_disposal_demands WHERE fifo_version = ?", bind: [fifo] },
        { sql: "DELETE FROM accounting_fifo_runs WHERE fifo_version = ?", bind: [fifo] },
        { sql: "DELETE FROM accounting_cost_lots WHERE cost_lot_version = ?", bind: [costLot] },
        { sql: "DELETE FROM accounting_lot_groups WHERE cost_lot_version = ?", bind: [costLot] },
        { sql: "DELETE FROM accounting_cost_lot_dispositions WHERE cost_lot_version = ?", bind: [costLot] },
        { sql: "DELETE FROM accounting_cost_lot_runs WHERE cost_lot_version = ?", bind: [costLot] },
        { sql: "DELETE FROM accounting_ledger_lines WHERE ledger_version = ?", bind: [ledger] },
        { sql: "DELETE FROM accounting_ledger_transactions WHERE ledger_version = ?", bind: [ledger] },
        { sql: "DELETE FROM accounting_ledger_runs WHERE ledger_version = ?", bind: [ledger] },
        { sql: "DELETE FROM accounting_projections WHERE projection_version = ?", bind: [projection] },
        { sql: "DELETE FROM accounting_projection_runs WHERE projection_version = ?", bind: [projection] },
      );
    }
    if (previous) {
      statements.push(
        { sql: "UPDATE disposal_resolutions SET status = 'superseded', is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1", bind: [now, previous.id] },
        { sql: "DELETE FROM accounting_projections WHERE canonical_event_id IN (SELECT id FROM canonical_events WHERE source_log_id = ? AND parser_name = 'disposal-resolution-projector')", bind: [previous.completionSourceLogId] },
        { sql: "DELETE FROM disposal_resolution_event_links WHERE resolution_id = ?", bind: [previous.id] },
        { sql: "DELETE FROM canonical_events WHERE source_log_id = ? AND parser_name = 'disposal-resolution-projector'", bind: [previous.completionSourceLogId] },
      );
    }
    statements.push({
      sql: `INSERT INTO disposal_resolutions
        (id, source_transaction_id, resolution_version, schema_version, resolver_version, accounting_policy_version, status, resolution_method, total_gross_proceeds, total_fees, total_net_proceeds, allocations_json, evidence_hash, completion_source_log_id, counterparty_id, transaction_timestamp, supersedes_resolution_id, is_active, created_at, updated_at, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      bind: [resolution.id, resolution.sourceTransactionId, resolution.resolutionVersion, resolution.schemaVersion, resolution.resolverVersion, resolution.accountingPolicyVersion, resolution.status, resolution.resolutionMethod, resolution.totalGrossProceeds, resolution.totalFees, resolution.totalNetProceeds, stableStringify(resolution.allocations), resolution.evidenceHash, resolution.completionSourceLogId, resolution.counterpartyId, resolution.transactionTimestamp, resolution.supersedesResolutionId, resolution.createdAt, resolution.updatedAt, resolution.resolvedAt],
    });
    canonicalEvents.forEach((event) => {
      statements.push({
        sql: `INSERT INTO canonical_events (id, source_log_id, event_timestamp, parser_name, parser_version, schema_version, event_type, canonical_payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [event.id, event.sourceLogId, event.eventTimestamp, event.parserName, event.parserVersion, event.schemaVersion, event.eventType, stableStringify(event), now],
      });
      statements.push({
        sql: "INSERT INTO disposal_resolution_event_links (resolution_id, canonical_event_id, allocation_index, lot_index, created_at) VALUES (?, ?, ?, ?, ?)",
        bind: [resolution.id, event.id, Number(event.attributes?.allocationIndex) || 0, Number(event.attributes?.lotIndex) || 0, now],
      });
    });
    statements.push(...staleStatements(resolution.id, now));
    await this.database.transaction(statements);
    return resolution;
  }
}
