import { Database } from "./database-client.js";
import { inventoryPositionPayload } from "../services/history/inventory-position.js";

function numeric(value){ const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function placeholders(values){ return values.map(() => "?").join(","); }
function ownedPositionFilter(positionVersion, { health = null, status = null, search = null, itemIds = [], basisCompleteness = null, identityType = null, includeConsumed = false, minimumConfidence = null } = {}){
  const where = ["position_version = ?"]; const bind = [positionVersion];
  if (!includeConsumed) where.push("remaining_quantity > 0");
  if (health) { where.push("position_health = ?"); bind.push(health); }
  if (status) { where.push("position_status = ?"); bind.push(status); }
  if (identityType === "uid") where.push("item_uid IS NOT NULL"); else if (identityType === "fungible") where.push("item_uid IS NULL");
  if (minimumConfidence !== null) { where.push("position_confidence >= ?"); bind.push(Math.max(0, Math.min(100, Number(minimumConfidence)))); }
  if (basisCompleteness === "COMPLETE") where.push("deferred_quantity = 0 AND unknown_quantity = 0");
  else if (basisCompleteness === "PARTIAL") where.push("known_quantity > 0 AND (deferred_quantity > 0 OR unknown_quantity > 0)");
  else if (basisCompleteness === "DEFERRED") where.push("known_quantity = 0 AND deferred_quantity > 0 AND unknown_quantity = 0");
  else if (basisCompleteness === "UNKNOWN") where.push("known_quantity = 0 AND unknown_quantity > 0");
  else if (basisCompleteness === "NONE") where.push("remaining_quantity = 0");
  const normalizedIds = [...new Set(itemIds.map(String).filter((value) => /^\d+$/.test(value)))].slice(0, 5000);
  if (search || normalizedIds.length) {
    const alternatives = [];
    if (search) { alternatives.push("item_id = ?", "item_uid LIKE ?", "item_name LIKE ?"); bind.push(String(search), `%${search}%`, `%${search}%`); }
    if (normalizedIds.length) { alternatives.push(`item_id IN (${placeholders(normalizedIds)})`); bind.push(...normalizedIds); }
    where.push(`(${alternatives.join(" OR ")})`);
  }
  return { where, bind };
}
async function existing(database, rows){
  if (!rows.length) return new Set();
  const result = await database.query(`SELECT id FROM accounting_inventory_positions WHERE id IN (${placeholders(rows)})`, rows.map((row) => row.id));
  return new Set(result.map((row) => row.id));
}

export class InventoryPositionRepository {
  constructor(database = Database){ this.database = database; }
  async startRun({ positionVersion, sourceCostLotVersion, sourceFifoVersion, sourceLedgerVersion, sourceProjectionVersion = null, startedAt = Date.now() }){
    await this.database.transaction([
      { sql: "UPDATE accounting_inventory_position_runs SET status = 'failed', completed_at = ?, error_summary = ? WHERE position_version = ? AND status = 'running'", bind: [startedAt, "Interrupted before completion; superseded by a new Inventory Position rebuild.", positionVersion] },
      { sql: "INSERT INTO accounting_inventory_position_runs (position_version, source_cost_lot_version, source_fifo_version, source_ledger_version, source_projection_version, status, started_at, metrics_json) VALUES (?, ?, ?, ?, ?, 'running', ?, '{}')", bind: [positionVersion, sourceCostLotVersion, sourceFifoVersion, sourceLedgerVersion, sourceProjectionVersion, startedAt] },
    ]);
    const rows = await this.database.query("SELECT * FROM accounting_inventory_position_runs WHERE position_version = ? ORDER BY id DESC LIMIT 1", [positionVersion]); return rows[0];
  }
  async updateRunProgress(id, metrics){ await this.database.transaction([{ sql: "UPDATE accounting_inventory_position_runs SET metrics_json = ? WHERE id = ? AND status = 'running'", bind: [inventoryPositionPayload(metrics), id] }]); }
  async finishRun(id, { status, metrics, sourceProjectionVersion = null, errorSummary = null, completedAt = Date.now() }){ await this.database.transaction([{ sql: "UPDATE accounting_inventory_position_runs SET status = ?, completed_at = ?, source_projection_version = COALESCE(?, source_projection_version), metrics_json = ?, error_summary = ? WHERE id = ?", bind: [status, completedAt, sourceProjectionVersion, inventoryPositionPayload(metrics), errorSummary, id] }]); }
  async latestRun(positionVersion){ const rows = await this.database.query("SELECT * FROM accounting_inventory_position_runs WHERE position_version = ? ORDER BY id DESC LIMIT 1", [positionVersion]); return rows[0] ? { ...rows[0], metrics: JSON.parse(rows[0].metrics_json) } : null; }
  async storePositions(rows, runId, { now = Date.now() } = {}){
    const found = await existing(this.database, rows);
    const statements = rows.map((row) => ({ sql: `INSERT INTO accounting_inventory_positions (
      id, position_version, item_id, item_name, item_uid, source_cost_lot_version, source_fifo_version, source_ledger_version,
      source_projection_version, first_acquisition_timestamp, last_acquisition_timestamp, original_quantity, consumed_quantity,
      remaining_quantity, original_basis, consumed_basis, remaining_basis, known_quantity, deferred_quantity, unknown_quantity,
      known_basis, deferred_basis, fifo_ready_quantity, uid_quantity, fungible_quantity, open_lot_count,
      partially_consumed_lot_count, fully_consumed_lot_count, lot_count, position_status, position_health,
      position_confidence, created_timestamp, rebuild_run_id, payload_json, created_at, rebuilt_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      item_name=excluded.item_name, source_cost_lot_version=excluded.source_cost_lot_version, source_fifo_version=excluded.source_fifo_version,
      source_ledger_version=excluded.source_ledger_version, source_projection_version=excluded.source_projection_version,
      first_acquisition_timestamp=excluded.first_acquisition_timestamp, last_acquisition_timestamp=excluded.last_acquisition_timestamp,
      original_quantity=excluded.original_quantity, consumed_quantity=excluded.consumed_quantity, remaining_quantity=excluded.remaining_quantity,
      original_basis=excluded.original_basis, consumed_basis=excluded.consumed_basis, remaining_basis=excluded.remaining_basis,
      known_quantity=excluded.known_quantity, deferred_quantity=excluded.deferred_quantity, unknown_quantity=excluded.unknown_quantity,
      known_basis=excluded.known_basis, deferred_basis=excluded.deferred_basis, fifo_ready_quantity=excluded.fifo_ready_quantity,
      uid_quantity=excluded.uid_quantity, fungible_quantity=excluded.fungible_quantity, open_lot_count=excluded.open_lot_count,
      partially_consumed_lot_count=excluded.partially_consumed_lot_count, fully_consumed_lot_count=excluded.fully_consumed_lot_count,
      lot_count=excluded.lot_count, position_status=excluded.position_status, position_health=excluded.position_health,
      position_confidence=excluded.position_confidence, created_timestamp=excluded.created_timestamp,
      rebuild_run_id=excluded.rebuild_run_id, payload_json=excluded.payload_json, rebuilt_at=excluded.rebuilt_at`, bind: [
      row.id, row.positionVersion, row.itemId, row.itemName, row.itemUid, row.sourceCostLotVersion, row.sourceFifoVersion,
      row.sourceLedgerVersion, row.sourceProjectionVersion, row.firstAcquisitionTimestamp, row.lastAcquisitionTimestamp,
      row.originalQuantity, row.consumedQuantity, row.remainingQuantity, row.originalBasis, row.consumedBasis, row.remainingBasis,
      row.knownQuantity, row.deferredQuantity, row.unknownQuantity, row.knownBasis, row.deferredBasis, row.fifoReadyQuantity,
      row.uidQuantity, row.fungibleQuantity, row.openLotCount, row.partiallyConsumedLotCount, row.fullyConsumedLotCount,
      row.lotCount, row.positionStatus, row.positionHealth, row.positionConfidence, row.createdTimestamp, runId,
      inventoryPositionPayload(row), now, now,
    ] }));
    if (statements.length) await this.database.transaction(statements);
    return { positionsInserted: rows.filter((row) => !found.has(row.id)).length, existingPositions: rows.filter((row) => found.has(row.id)).length };
  }
  async storeDiagnostics(rows, runId, { now = Date.now() } = {}){
    const statements = rows.map((row) => ({ sql: `INSERT INTO accounting_inventory_position_diagnostics
      (id, position_version, reason_code, item_id, item_uid, position_id, supporting_quantity, supporting_basis, detail, diagnostic_timestamp, rebuild_run_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET supporting_quantity=excluded.supporting_quantity, supporting_basis=excluded.supporting_basis,
      detail=excluded.detail, diagnostic_timestamp=excluded.diagnostic_timestamp, rebuild_run_id=excluded.rebuild_run_id, payload_json=excluded.payload_json`, bind: [row.id, row.positionVersion, row.reasonCode, row.itemId, row.itemUid, row.positionId, row.supportingQuantity, row.supportingBasis, row.detail ?? row.reasonCode, row.timestamp, runId, inventoryPositionPayload(row), now] }));
    if (statements.length) await this.database.transaction(statements);
  }
  async pruneVersion(positionVersion, runId){ await this.database.transaction([
    { sql: "DELETE FROM accounting_inventory_position_diagnostics WHERE position_version = ? AND rebuild_run_id <> ?", bind: [positionVersion, runId] },
    { sql: "DELETE FROM accounting_inventory_positions WHERE position_version = ? AND rebuild_run_id <> ?", bind: [positionVersion, runId] },
  ]); }
  async countRows(positionVersion){
    const rows = await this.database.query("SELECT COUNT(*) AS positions FROM accounting_inventory_positions WHERE position_version = ?", [positionVersion]);
    const diagnostics = await this.database.query("SELECT COUNT(*) AS diagnostics FROM accounting_inventory_position_diagnostics WHERE position_version = ?", [positionVersion]);
    return { positions: numeric(rows[0]?.positions), diagnostics: numeric(diagnostics[0]?.diagnostics) };
  }
  async getPosition(positionVersion, id){ const rows = await this.database.query("SELECT payload_json FROM accounting_inventory_positions WHERE position_version = ? AND id = ?", [positionVersion, id]); return rows[0] ? JSON.parse(rows[0].payload_json) : null; }
  async getByUid(positionVersion, itemUid){ const rows = await this.database.query("SELECT payload_json FROM accounting_inventory_positions WHERE position_version = ? AND item_uid = ? ORDER BY item_id", [positionVersion, String(itemUid)]); return rows.map((row) => JSON.parse(row.payload_json)); }
  async getByItem(positionVersion, itemId){ const rows = await this.database.query("SELECT payload_json FROM accounting_inventory_positions WHERE position_version = ? AND item_id = ? ORDER BY item_uid", [positionVersion, String(itemId)]); return rows.map((row) => JSON.parse(row.payload_json)); }
  async getPositionById(positionVersion, id){ return this.getPosition(positionVersion, id); }
  async getPositionByItemAndUid(positionVersion, itemId, itemUid = null){ const uidClause = itemUid === null || itemUid === undefined || itemUid === "" ? "item_uid IS NULL" : "item_uid = ?"; const bind = [positionVersion, String(itemId)]; if (uidClause.includes("= ?")) bind.push(String(itemUid)); const rows = await this.database.query(`SELECT payload_json FROM accounting_inventory_positions WHERE position_version = ? AND item_id = ? AND ${uidClause} LIMIT 1`, bind); return rows[0] ? JSON.parse(rows[0].payload_json) : null; }
  async getPositionsByItemId(positionVersion, itemId){ return this.getByItem(positionVersion, itemId); }
  async listOwnedPositions(positionVersion, options = {}){
    const { where, bind } = ownedPositionFilter(positionVersion, options); const columns = { remainingQuantity: "remaining_quantity", knownRemainingBasis: "known_basis", confidence: "position_confidence", firstAcquisition: "first_acquisition_timestamp", lastAcquisition: "last_acquisition_timestamp", itemName: "item_id" }; const order = columns[options.sort] ?? columns.remainingQuantity; const direction = options.direction === "asc" ? "ASC" : "DESC"; const limit = Math.max(1, Math.min(Number(options.limit) || 100, 500)); const offset = Math.max(0, Number(options.offset) || 0);
    const rows = await this.database.query(`SELECT payload_json FROM accounting_inventory_positions WHERE ${where.join(" AND ")} ORDER BY ${order} ${direction}, item_id ASC, item_uid ASC LIMIT ? OFFSET ?`, [...bind, limit, offset]); return rows.map((row) => JSON.parse(row.payload_json));
  }
  async searchOwnedPositions(positionVersion, options = {}){ return this.listOwnedPositions(positionVersion, options); }
  async countOwnedPositions(positionVersion, options = {}){ const { where, bind } = ownedPositionFilter(positionVersion, options); const rows = await this.database.query(`SELECT COUNT(*) AS count FROM accounting_inventory_positions WHERE ${where.join(" AND ")}`, bind); return numeric(rows[0]?.count); }
  async getRemainingQuantity(positionVersion, id){ const rows = await this.database.query("SELECT remaining_quantity AS value FROM accounting_inventory_positions WHERE position_version = ? AND id = ?", [positionVersion, id]); return rows[0] ? numeric(rows[0].value) : null; }
  async getRemainingBasis(positionVersion, id){ const rows = await this.database.query("SELECT remaining_basis AS value FROM accounting_inventory_positions WHERE position_version = ? AND id = ?", [positionVersion, id]); return rows[0] ? (rows[0].value === null ? null : numeric(rows[0].value)) : null; }
  async listRemainingInventory(positionVersion, options = {}){ return this.listPositions(positionVersion, { ...options, remainingOnly: true }); }
  async listDeferredPositions(positionVersion, options = {}){ return this.listPositions(positionVersion, { ...options, status: "DEFERRED" }); }
  async listUnknownPositions(positionVersion, options = {}){ return this.listPositions(positionVersion, { ...options, status: "UNKNOWN" }); }
  async listNegativePositions(positionVersion, options = {}){ return this.listPositions(positionVersion, { ...options, status: "NEGATIVE" }); }
  async listHealthyPositions(positionVersion, options = {}){ return this.listPositions(positionVersion, { ...options, health: "HEALTHY" }); }
  async listWarningPositions(positionVersion, options = {}){ return this.listPositions(positionVersion, { ...options, health: "WARNING" }); }
  async listUnhealthyPositions(positionVersion, options = {}){ return this.listPositions(positionVersion, { ...options, health: "UNHEALTHY" }); }
  async topRemainingBasis(positionVersion, limit = 100){ return this.listPositions(positionVersion, { remainingOnly: true, sort: "remainingBasis", limit }); }
  async topRemainingQuantity(positionVersion, limit = 100){ return this.listPositions(positionVersion, { remainingOnly: true, sort: "remainingQuantity", limit }); }
  async tracePosition(positionVersion, id, { sourceCostLotVersion = 1, sourceFifoVersion = 1, limit = 100 } = {}){
    const position = await this.getPosition(positionVersion, id); if (!position) return null;
    const bounded = Math.max(1, Math.min(Number(limit) || 100, 500)); const uidClause = position.itemUid ? "item_uid = ?" : "item_uid IS NULL"; const lotBind = [sourceCostLotVersion, position.itemId]; if (position.itemUid) lotBind.push(position.itemUid); lotBind.push(bounded);
    const lots = await this.database.query(`SELECT id AS sourceLotId, lot_group_id AS sourceLotGroupId, source_ledger_transaction_id AS sourceLedgerTransactionId,
      source_ledger_line_id AS sourceLedgerLineId, source_projection_id AS sourceProjectionId, source_canonical_event_id AS sourceCanonicalEventId,
      acquisition_timestamp AS acquisitionTimestamp, original_quantity AS originalQuantity
      FROM accounting_cost_lots WHERE cost_lot_version = ? AND item_id = ? AND ${uidClause}
      ORDER BY acquisition_sequence ASC LIMIT ?`, lotBind);
    const consumptions = lots.length ? await this.database.query(`SELECT id AS consumptionId, disposal_demand_id AS disposalDemandId, source_lot_id AS sourceLotId,
      source_disposal_ledger_transaction_id AS sourceLedgerTransactionId, source_disposal_projection_id AS sourceProjectionId,
      source_disposal_canonical_event_id AS sourceCanonicalEventId, consumed_quantity AS consumedQuantity, disposal_timestamp AS disposalTimestamp
      FROM accounting_fifo_consumptions WHERE fifo_version = ? AND source_lot_id IN (${placeholders(lots)})
      ORDER BY disposal_sequence, match_sequence_within_disposal LIMIT ?`, [sourceFifoVersion, ...lots.map((row) => row.sourceLotId), bounded]) : [];
    return { position, lots, consumptions };
  }
  async listPositions(positionVersion, { health = null, status = null, search = null, minimumConfidence = null, remainingOnly = false, sort = "remainingQuantity", direction = "desc", limit = 100 } = {}){
    const where = ["position_version = ?"]; const bind = [positionVersion];
    if (health) { where.push("position_health = ?"); bind.push(health); }
    if (status) { where.push("position_status = ?"); bind.push(status); }
    if (search) { where.push("(item_name LIKE ? OR item_id = ? OR item_uid = ?)"); bind.push(`%${search}%`, String(search), String(search)); }
    if (minimumConfidence !== null) { where.push("position_confidence >= ?"); bind.push(Math.max(0, Math.min(100, Number(minimumConfidence)))); }
    if (remainingOnly) where.push("remaining_quantity > 0");
    const columns = { remainingQuantity: "remaining_quantity", remainingBasis: "remaining_basis", firstAcquisition: "first_acquisition_timestamp", lastAcquisition: "last_acquisition_timestamp", confidence: "position_confidence" };
    const order = columns[sort] ?? columns.remainingQuantity; const orderDirection = direction === "asc" ? "ASC" : "DESC"; bind.push(Math.max(1, Math.min(Number(limit) || 100, 500)));
    const rows = await this.database.query(`SELECT payload_json FROM accounting_inventory_positions WHERE ${where.join(" AND ")} ORDER BY ${order} ${orderDirection}, item_id, item_uid LIMIT ?`, bind); return rows.map((row) => JSON.parse(row.payload_json));
  }
  async listDiagnostics(positionVersion, limit = 25){ const rows = await this.database.query("SELECT payload_json FROM accounting_inventory_position_diagnostics WHERE position_version = ? ORDER BY reason_code, id LIMIT ?", [positionVersion, Math.max(1, Math.min(Number(limit) || 25, 100))]); return rows.map((row) => JSON.parse(row.payload_json)); }
  async summary(positionVersion){
    const rows = await this.database.query(`SELECT COUNT(*) AS positions, COALESCE(SUM(remaining_quantity), 0) AS remainingQuantity,
      COALESCE(SUM(known_basis), 0) AS knownBasis, COALESCE(SUM(known_quantity), 0) AS knownQuantity,
      COALESCE(SUM(deferred_quantity), 0) AS deferredQuantity, COALESCE(SUM(unknown_quantity), 0) AS unknownQuantity,
      COALESCE(SUM(fifo_ready_quantity), 0) AS fifoReadyQuantity, COALESCE(SUM(uid_quantity), 0) AS uidQuantity,
      COALESCE(SUM(fungible_quantity), 0) AS fungibleQuantity
      FROM accounting_inventory_positions WHERE position_version = ?`, [positionVersion]); return Object.fromEntries(Object.entries(rows[0] ?? {}).map(([key, value]) => [key, numeric(value)]));
  }
  async clearVersion(positionVersion){ await this.database.transaction([
    { sql: "DELETE FROM accounting_inventory_position_diagnostics WHERE position_version = ?", bind: [positionVersion] },
    { sql: "DELETE FROM accounting_inventory_positions WHERE position_version = ?", bind: [positionVersion] },
  ]); }
}
