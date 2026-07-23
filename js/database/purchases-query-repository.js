import { Database } from "./database-client.js";

function numeric(value){ const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function boundedLimit(value, fallback = 100){ return Math.max(1, Math.min(Number(value) || fallback, 500)); }
function identityClause(itemUid, bind){ if (itemUid === null || itemUid === undefined || itemUid === "") return "l.item_uid IS NULL"; bind.push(String(itemUid)); return "l.item_uid = ?"; }

export class PurchasesQueryRepository {
  constructor(database = Database){ this.database = database; }
  async listLotsByPositionIdentity({ costLotVersion, fifoVersion, itemId, itemUid = null, state = "all", limit = 100, offset = 0 } = {}){
    const bind = [fifoVersion, costLotVersion, String(itemId)]; const uidWhere = identityClause(itemUid, bind); let having = "";
    if (state === "remaining") having = "HAVING l.original_quantity - COALESCE(SUM(c.consumed_quantity), 0) > 0";
    else if (state === "closed") having = "HAVING l.original_quantity - COALESCE(SUM(c.consumed_quantity), 0) = 0";
    else if (state === "partial") having = "HAVING COALESCE(SUM(c.consumed_quantity), 0) > 0 AND l.original_quantity - COALESCE(SUM(c.consumed_quantity), 0) > 0";
    bind.push(boundedLimit(limit), Math.max(0, Number(offset) || 0));
    const rows = await this.database.query(`SELECT l.id AS lotId, l.lot_group_id AS lotGroupId, l.item_id AS itemId, l.item_uid AS itemUid,
      l.original_quantity AS originalQuantity, l.allocated_basis AS originalAllocatedBasis, l.unit_basis AS originalUnitBasis,
      l.basis_status AS basisStatus, l.allocation_status AS allocationStatus, l.lot_status AS sourceLotStatus,
      l.acquisition_timestamp AS acquisitionTimestamp, l.acquisition_sequence AS acquisitionSequence,
      l.source_ledger_transaction_id AS sourceLedgerTransactionId, l.source_ledger_line_id AS sourceLedgerLineId,
      l.source_projection_id AS sourceProjectionId, l.source_canonical_event_id AS sourceCanonicalEventId,
      l.payload_json AS lotPayloadJson,
      COUNT(c.id) AS consumptionCount, COALESCE(SUM(c.consumed_quantity), 0) AS consumedQuantity,
      COALESCE(SUM(c.consumed_allocated_basis), 0) AS consumedKnownBasis,
      SUM(CASE WHEN c.id IS NOT NULL AND c.consumed_allocated_basis IS NULL THEN 1 ELSE 0 END) AS nullBasisConsumptionCount,
      MIN(c.disposal_timestamp) AS firstConsumptionTimestamp, MAX(c.disposal_timestamp) AS lastConsumptionTimestamp
      FROM accounting_cost_lots l
      LEFT JOIN accounting_fifo_consumptions c ON c.source_lot_id = l.id AND c.fifo_version = ?
      WHERE l.cost_lot_version = ? AND l.item_id = ? AND ${uidWhere}
      GROUP BY l.id ${having}
      ORDER BY l.acquisition_sequence DESC, l.id DESC LIMIT ? OFFSET ?`, bind);
    return rows.map((row) => {
      const payload = JSON.parse(row.lotPayloadJson);
      const { lotPayloadJson, ...values } = row;
      return {
        ...values,
        sourceClassification: payload.sourceAccountingClassification ?? null,
        sourcePolicyCode: payload.sourceLedgerPolicyCode ?? null,
        originalQuantity: numeric(row.originalQuantity),
        originalAllocatedBasis: row.originalAllocatedBasis === null ? null : numeric(row.originalAllocatedBasis),
        originalUnitBasis: row.originalUnitBasis === null ? null : numeric(row.originalUnitBasis),
        acquisitionTimestamp: numeric(row.acquisitionTimestamp),
        consumptionCount: numeric(row.consumptionCount),
        consumedQuantity: numeric(row.consumedQuantity),
        consumedKnownBasis: numeric(row.consumedKnownBasis),
        nullBasisConsumptionCount: numeric(row.nullBasisConsumptionCount),
        firstConsumptionTimestamp: row.firstConsumptionTimestamp === null ? null : numeric(row.firstConsumptionTimestamp),
        lastConsumptionTimestamp: row.lastConsumptionTimestamp === null ? null : numeric(row.lastConsumptionTimestamp),
      };
    });
  }
  async countLotsByPositionIdentity({ costLotVersion, fifoVersion, itemId, itemUid = null, state = "all" } = {}){
    const bind = [fifoVersion, costLotVersion, String(itemId)]; const uidWhere = identityClause(itemUid, bind); let condition = "1 = 1";
    if (state === "remaining") condition = "remainingQuantity > 0"; else if (state === "closed") condition = "remainingQuantity = 0"; else if (state === "partial") condition = "consumedQuantity > 0 AND remainingQuantity > 0";
    const rows = await this.database.query(`SELECT COUNT(*) AS count FROM (
      SELECT l.id, l.original_quantity - COALESCE(SUM(c.consumed_quantity), 0) AS remainingQuantity, COALESCE(SUM(c.consumed_quantity), 0) AS consumedQuantity
      FROM accounting_cost_lots l LEFT JOIN accounting_fifo_consumptions c ON c.source_lot_id = l.id AND c.fifo_version = ?
      WHERE l.cost_lot_version = ? AND l.item_id = ? AND ${uidWhere} GROUP BY l.id
    ) WHERE ${condition}`, bind); return numeric(rows[0]?.count);
  }
  async listRemainingKnownBasisRatios({ costLotVersion, fifoVersion, itemId, itemUid = null, limit = 500, offset = 0 } = {}){
    const bind = [fifoVersion, costLotVersion, String(itemId)];
    const uidWhere = identityClause(itemUid, bind);
    bind.push(boundedLimit(limit, 500), Math.max(0, Number(offset) || 0));
    const rows = await this.database.query(`SELECT l.id AS lotId, l.original_quantity AS originalQuantity,
      l.allocated_basis AS originalAllocatedBasis, l.basis_status AS basisStatus, l.allocation_status AS allocationStatus,
      COALESCE(SUM(c.consumed_quantity), 0) AS consumedQuantity,
      COALESCE(SUM(c.consumed_allocated_basis), 0) AS consumedKnownBasis
      FROM accounting_cost_lots l
      LEFT JOIN accounting_fifo_consumptions c ON c.source_lot_id = l.id AND c.fifo_version = ?
      WHERE l.cost_lot_version = ? AND l.item_id = ? AND ${uidWhere}
        AND l.basis_status IN ('known_allocated_basis', 'known_no_cash_consideration')
      GROUP BY l.id
      HAVING l.original_quantity - COALESCE(SUM(c.consumed_quantity), 0) > 0
      ORDER BY l.id LIMIT ? OFFSET ?`, bind);
    return rows.map((row) => ({
      ...row,
      originalQuantity: numeric(row.originalQuantity),
      originalAllocatedBasis: row.originalAllocatedBasis === null ? null : numeric(row.originalAllocatedBasis),
      consumedQuantity: numeric(row.consumedQuantity),
      consumedKnownBasis: numeric(row.consumedKnownBasis),
    }));
  }
  async listConsumptionsByPositionIdentity({ costLotVersion, fifoVersion, itemId, itemUid = null, limit = 100, offset = 0 } = {}){
    const bind = [fifoVersion, costLotVersion, String(itemId)]; const uidWhere = identityClause(itemUid, bind); bind.push(boundedLimit(limit), Math.max(0, Number(offset) || 0));
    const rows = await this.database.query(`SELECT c.id AS consumptionId, c.disposal_demand_id AS disposalDemandId, c.source_lot_id AS sourceLotId,
      c.consumed_quantity AS consumedQuantity, c.consumed_allocated_basis AS consumedKnownBasis, c.disposal_timestamp AS disposalTimestamp,
      c.match_type AS matchType, c.policy_code AS policyCode, c.source_disposal_ledger_transaction_id AS sourceLedgerTransactionId,
      c.source_disposal_projection_id AS sourceProjectionId, c.source_disposal_canonical_event_id AS sourceCanonicalEventId
      FROM accounting_fifo_consumptions c JOIN accounting_cost_lots l ON l.id = c.source_lot_id
      WHERE c.fifo_version = ? AND l.cost_lot_version = ? AND l.item_id = ? AND ${uidWhere}
      ORDER BY c.disposal_sequence DESC, c.match_sequence_within_disposal DESC LIMIT ? OFFSET ?`, bind);
    return rows.map((row) => ({ ...row, consumedQuantity: numeric(row.consumedQuantity), consumedKnownBasis: row.consumedKnownBasis === null ? null : numeric(row.consumedKnownBasis), disposalTimestamp: numeric(row.disposalTimestamp) }));
  }
  async countConsumptionsByPositionIdentity({ costLotVersion, fifoVersion, itemId, itemUid = null } = {}){
    const bind = [fifoVersion, costLotVersion, String(itemId)];
    const uidWhere = identityClause(itemUid, bind);
    const rows = await this.database.query(`SELECT COUNT(*) AS count FROM accounting_fifo_consumptions c
      JOIN accounting_cost_lots l ON l.id = c.source_lot_id
      WHERE c.fifo_version = ? AND l.cost_lot_version = ? AND l.item_id = ? AND ${uidWhere}`, bind);
    return numeric(rows[0]?.count);
  }
  async itemLevelUnassignedEvidence(fifoVersion, itemId){
    const rows = await this.database.query(`SELECT reason_code AS reasonCode, demand_status AS demandStatus, COUNT(*) AS occurrenceCount,
      COALESCE(SUM(unmatched_quantity), 0) AS unmatchedQuantity FROM accounting_fifo_disposal_demands
      WHERE fifo_version = ? AND item_id = ? AND item_uid IS NULL AND (unmatched_quantity > 0 OR demand_status = 'unresolved')
      GROUP BY reason_code, demand_status ORDER BY unmatchedQuantity DESC, reason_code`, [fifoVersion, String(itemId)]);
    return rows.map((row) => ({ ...row, occurrenceCount: numeric(row.occurrenceCount), unmatchedQuantity: numeric(row.unmatchedQuantity) }));
  }
}
