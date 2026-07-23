import { Database } from "./database-client.js";
import { costLotPayload } from "../services/history/cost-lot.js";

function numeric(value){ const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function placeholders(values){ return values.map(() => "?").join(","); }

export class CostLotRepository {
  constructor(database = Database){ this.database = database; }
  async startRun({ costLotVersion, sourceLedgerVersion, startedAt = Date.now() }){
    await this.database.transaction([{ sql: "INSERT INTO accounting_cost_lot_runs (cost_lot_version, source_ledger_version, status, started_at, metrics_json) VALUES (?, ?, 'running', ?, '{}')", bind: [costLotVersion, sourceLedgerVersion, startedAt] }]);
    const rows = await this.database.query("SELECT * FROM accounting_cost_lot_runs ORDER BY id DESC LIMIT 1"); return rows[0];
  }
  async finishRun(id, { status, metrics, errorSummary = null, completedAt = Date.now() }){
    await this.database.transaction([{ sql: "UPDATE accounting_cost_lot_runs SET status = ?, completed_at = ?, metrics_json = ?, error_summary = ? WHERE id = ?", bind: [status, completedAt, costLotPayload(metrics), errorSummary, id] }]);
  }
  async updateRunProgress(id, metrics){ await this.database.transaction([{ sql: "UPDATE accounting_cost_lot_runs SET metrics_json = ? WHERE id = ? AND status = 'running'", bind: [costLotPayload(metrics), id] }]); }
  async storeBatch(outputs, { now = Date.now() } = {}){
    const groups = outputs.flatMap((output) => output.group ? [output.group] : []); const lots = outputs.flatMap((output) => output.lots); const dispositions = outputs.map((output) => output.disposition);
    const existingGroupIds = groups.length ? new Set((await this.database.query(`SELECT id FROM accounting_lot_groups WHERE id IN (${placeholders(groups)})`, groups.map((row) => row.id))).map((row) => row.id)) : new Set();
    const existingLotIds = lots.length ? new Set((await this.database.query(`SELECT id FROM accounting_cost_lots WHERE id IN (${placeholders(lots)})`, lots.map((row) => row.id))).map((row) => row.id)) : new Set();
    const existingDispositionIds = dispositions.length ? new Set((await this.database.query(`SELECT id FROM accounting_cost_lot_dispositions WHERE id IN (${placeholders(dispositions)})`, dispositions.map((row) => row.id))).map((row) => row.id)) : new Set();
    const statements = [];
    groups.forEach((group) => statements.push({ sql: `INSERT INTO accounting_lot_groups
      (id, cost_lot_version, source_ledger_version, source_projection_version, source_ledger_transaction_id, source_projection_id, source_canonical_event_id, event_timestamp, group_type, group_status, basis_status, allocation_status, original_total_basis, allocated_total_basis, unallocated_total_basis, lot_count, original_total_quantity, remaining_total_quantity, payload_json, created_at, rebuilt_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json, rebuilt_at=excluded.rebuilt_at`, bind: [group.id, group.costLotVersion, group.sourceLedgerVersion, group.sourceProjectionVersion, group.sourceLedgerTransactionId, group.sourceProjectionId, group.sourceCanonicalEventId, group.eventTimestamp, group.groupType, group.groupStatus, group.basisStatus, group.allocationStatus, group.originalTotalBasis, group.allocatedTotalBasis, group.unallocatedTotalBasis, group.lotCount, group.originalTotalQuantity, group.remainingTotalQuantity, costLotPayload(group), now, now] }));
    lots.forEach((lot) => statements.push({ sql: `INSERT INTO accounting_cost_lots
      (id, lot_group_id, cost_lot_version, source_ledger_version, source_ledger_transaction_id, source_ledger_line_id, source_projection_id, source_canonical_event_id, item_id, item_uid, original_quantity, remaining_quantity, consumed_quantity, lot_status, basis_status, allocation_status, original_total_basis, allocated_basis, unallocated_basis, unit_basis, acquisition_timestamp, acquisition_sequence, occurrence_sequence, payload_json, created_at, rebuilt_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json, rebuilt_at=excluded.rebuilt_at`, bind: [lot.id, lot.lotGroupId, lot.costLotVersion, lot.sourceLedgerVersion, lot.sourceLedgerTransactionId, lot.sourceLedgerLineId, lot.sourceProjectionId, lot.sourceCanonicalEventId, lot.itemId, lot.itemUid, lot.originalQuantity, lot.remainingQuantity, lot.consumedQuantity, lot.lotStatus, lot.basisStatus, lot.allocationStatus, lot.originalTotalBasis, lot.allocatedBasis, lot.unallocatedBasis, lot.unitBasis, lot.acquisitionTimestamp, lot.acquisitionSequence, lot.occurrenceSequence, costLotPayload(lot), now, now] }));
    dispositions.forEach((row) => statements.push({ sql: `INSERT INTO accounting_cost_lot_dispositions
      (id, cost_lot_version, source_ledger_version, source_ledger_transaction_id, disposition, reason_code, payload_json, created_at, rebuilt_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json, rebuilt_at=excluded.rebuilt_at`, bind: [row.id, row.costLotVersion, row.sourceLedgerVersion, row.sourceLedgerTransactionId, row.disposition, row.reasonCode, costLotPayload(row), now, now] }));
    if (statements.length) await this.database.transaction(statements);
    return { groupsInserted: groups.filter((row) => !existingGroupIds.has(row.id)).length, existingGroups: groups.filter((row) => existingGroupIds.has(row.id)).length, lotsInserted: lots.filter((row) => !existingLotIds.has(row.id)).length, existingLots: lots.filter((row) => existingLotIds.has(row.id)).length, dispositionsInserted: dispositions.filter((row) => !existingDispositionIds.has(row.id)).length, existingDispositions: dispositions.filter((row) => existingDispositionIds.has(row.id)).length };
  }
  async countRows(costLotVersion){
    const [groups] = await this.database.query("SELECT COUNT(*) AS count FROM accounting_lot_groups WHERE cost_lot_version = ?", [costLotVersion]); const [lots] = await this.database.query("SELECT COUNT(*) AS count FROM accounting_cost_lots WHERE cost_lot_version = ?", [costLotVersion]); const [dispositions] = await this.database.query("SELECT COUNT(*) AS count FROM accounting_cost_lot_dispositions WHERE cost_lot_version = ?", [costLotVersion]);
    return { groups: numeric(groups?.count), lots: numeric(lots?.count), dispositions: numeric(dispositions?.count) };
  }
  async latestRun(costLotVersion){ const rows = await this.database.query("SELECT * FROM accounting_cost_lot_runs WHERE cost_lot_version = ? ORDER BY id DESC LIMIT 1", [costLotVersion]); return rows[0] ? { ...rows[0], metrics: JSON.parse(rows[0].metrics_json) } : null; }
  async listRecentRuns(costLotVersion, limit = 10){ const rows = await this.database.query("SELECT * FROM accounting_cost_lot_runs WHERE cost_lot_version = ? ORDER BY id DESC LIMIT ?", [costLotVersion, Math.max(1, Math.min(Number(limit) || 10, 50))]); return rows.map((row) => ({ ...row, metrics: JSON.parse(row.metrics_json) })); }
  async listGroups(costLotVersion, limit = 10){ const rows = await this.database.query("SELECT payload_json FROM accounting_lot_groups WHERE cost_lot_version = ? ORDER BY event_timestamp DESC, id DESC LIMIT ?", [costLotVersion, Math.max(1, Math.min(Number(limit) || 10, 50))]); return rows.map((row) => JSON.parse(row.payload_json)); }
  async listLots(costLotVersion, limit = 10){ const rows = await this.database.query("SELECT payload_json FROM accounting_cost_lots WHERE cost_lot_version = ? ORDER BY acquisition_sequence DESC LIMIT ?", [costLotVersion, Math.max(1, Math.min(Number(limit) || 10, 50))]); return rows.map((row) => JSON.parse(row.payload_json)); }
  async findGroups(costLotVersion, { sourceLedgerTransactionId = null, groupStatus = null, basisStatus = null, allocationStatus = null, fromTimestamp = null, toTimestamp = null, limit = 50 } = {}){
    const where = ["cost_lot_version = ?"]; const bind = [costLotVersion]; const add = (sql, value) => { if (value !== null && value !== undefined && value !== "") { where.push(sql); bind.push(value); } };
    add("source_ledger_transaction_id = ?", sourceLedgerTransactionId); add("group_status = ?", groupStatus); add("basis_status = ?", basisStatus); add("allocation_status = ?", allocationStatus); add("event_timestamp >= ?", fromTimestamp); add("event_timestamp <= ?", toTimestamp); bind.push(Math.max(1, Math.min(Number(limit) || 50, 250)));
    const rows = await this.database.query(`SELECT payload_json FROM accounting_lot_groups WHERE ${where.join(" AND ")} ORDER BY event_timestamp ASC, id ASC LIMIT ?`, bind); return rows.map((row) => JSON.parse(row.payload_json));
  }
  async findLots(costLotVersion, { lotGroupId = null, itemId = null, itemUid = null, lotStatus = null, basisStatus = null, allocationStatus = null, limit = 100 } = {}){
    const where = ["cost_lot_version = ?"]; const bind = [costLotVersion]; const add = (sql, value) => { if (value !== null && value !== undefined && value !== "") { where.push(sql); bind.push(value); } };
    add("lot_group_id = ?", lotGroupId); add("item_id = ?", itemId); add("item_uid = ?", itemUid); add("lot_status = ?", lotStatus); add("basis_status = ?", basisStatus); add("allocation_status = ?", allocationStatus); bind.push(Math.max(1, Math.min(Number(limit) || 100, 500)));
    const rows = await this.database.query(`SELECT payload_json FROM accounting_cost_lots WHERE ${where.join(" AND ")} ORDER BY acquisition_sequence ASC, id ASC LIMIT ?`, bind); return rows.map((row) => JSON.parse(row.payload_json));
  }
  async openLotsForItem(costLotVersion, itemId, limit = 500){ return this.findLots(costLotVersion, { itemId: String(itemId), lotStatus: "open", limit }); }
  async totalsByItem(costLotVersion, itemId){ const rows = await this.database.query("SELECT COUNT(*) AS lotCount, COALESCE(SUM(original_quantity), 0) AS originalQuantity, COALESCE(SUM(remaining_quantity), 0) AS remainingQuantity FROM accounting_cost_lots WHERE cost_lot_version = ? AND item_id = ?", [costLotVersion, String(itemId)]); return { lotCount: numeric(rows[0]?.lotCount), originalQuantity: numeric(rows[0]?.originalQuantity), remainingQuantity: numeric(rows[0]?.remainingQuantity) }; }
  async getGroupWithLots(groupId){ const groups = await this.database.query("SELECT payload_json FROM accounting_lot_groups WHERE id = ?", [groupId]); if (!groups[0]) return null; const lots = await this.database.query("SELECT payload_json FROM accounting_cost_lots WHERE lot_group_id = ? ORDER BY acquisition_sequence", [groupId]); return { group: JSON.parse(groups[0].payload_json), lots: lots.map((row) => JSON.parse(row.payload_json)) }; }
  async listDispositions(costLotVersion, disposition, limit = 25){ const rows = await this.database.query("SELECT payload_json FROM accounting_cost_lot_dispositions WHERE cost_lot_version = ? AND disposition = ? ORDER BY source_ledger_transaction_id LIMIT ?", [costLotVersion, disposition, Math.max(1, Math.min(Number(limit) || 25, 100))]); return rows.map((row) => JSON.parse(row.payload_json)); }
  async pageLotsForFifo(costLotVersion, itemId, { sequence = null, id = null, limit = 500 } = {}){
    const bind = [costLotVersion, String(itemId)]; let cursor = "";
    if (sequence !== null) { cursor = " AND (acquisition_sequence > ? OR (acquisition_sequence = ? AND id > ?))"; bind.push(sequence, sequence, id ?? ""); }
    bind.push(Math.max(1, Math.min(Number(limit) || 500, 1000)));
    const rows = await this.database.query(`SELECT id, acquisition_sequence, payload_json FROM accounting_cost_lots WHERE cost_lot_version = ? AND item_id = ?${cursor} ORDER BY acquisition_sequence ASC, id ASC LIMIT ?`, bind); return rows.map((row) => ({ id: row.id, acquisition_sequence: row.acquisition_sequence, payload: JSON.parse(row.payload_json) }));
  }
  async pageLotsForInventoryPosition(costLotVersion, { timestamp = null, id = null, limit = 500 } = {}){
    const bind = [costLotVersion]; let cursor = "";
    if (timestamp !== null) { cursor = " AND (acquisition_timestamp > ? OR (acquisition_timestamp = ? AND id > ?))"; bind.push(timestamp, timestamp, id ?? ""); }
    bind.push(Math.max(1, Math.min(Number(limit) || 500, 1000)));
    const rows = await this.database.query(`SELECT id, acquisition_timestamp, payload_json FROM accounting_cost_lots WHERE cost_lot_version = ?${cursor} ORDER BY acquisition_timestamp ASC, id ASC LIMIT ?`, bind);
    return rows.map((row) => ({ id: row.id, acquisition_timestamp: numeric(row.acquisition_timestamp), payload: JSON.parse(row.payload_json) }));
  }
  async fifoSourceSummary(costLotVersion){ const rows = await this.database.query("SELECT COUNT(*) AS lots, COALESCE(SUM(original_quantity), 0) AS originalQuantity FROM accounting_cost_lots WHERE cost_lot_version = ?", [costLotVersion]); return { lots: numeric(rows[0]?.lots), originalQuantity: numeric(rows[0]?.originalQuantity) }; }
  async clearVersion(costLotVersion){ await this.database.transaction([{ sql: "DELETE FROM accounting_cost_lot_dispositions WHERE cost_lot_version = ?", bind: [costLotVersion] }, { sql: "DELETE FROM accounting_cost_lots WHERE cost_lot_version = ?", bind: [costLotVersion] }, { sql: "DELETE FROM accounting_lot_groups WHERE cost_lot_version = ?", bind: [costLotVersion] }]); }
}
