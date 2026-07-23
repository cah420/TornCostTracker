import { stableStringify } from "../raw-log-serialization.js";
import { FIFO_SOURCE_POLICY_REGISTRY } from "./fifo-source-policies.js";

export const FIFO_VERSION = 2;
export const FifoDisposition = Object.freeze({ consumed: "fifo_consumed", partial: "fifo_partially_consumed", noDemand: "no_disposal_demand", ineligible: "ineligible", deferred: "deferred", unresolved: "unresolved", insufficient: "insufficient_inventory", error: "fifo_error" });
export const FifoDemandStatus = Object.freeze({ pending: "pending", matched: "matched", partial: "partially_matched", unmatched: "unmatched", unresolved: "unresolved", error: "fifo_error" });
export const FifoMatchType = Object.freeze({ uid: "uid_exact", fungible: "fungible_fifo", deferred: "deferred_basis_fifo" });
const dispositions = new Set(Object.values(FifoDisposition)); const demandStatuses = new Set(Object.values(FifoDemandStatus)); const matchTypes = new Set(Object.values(FifoMatchType));

function source(transaction){ return { sourceCostLotVersion: 1, sourceLedgerVersion: transaction.ledgerVersion, sourceLedgerTransactionId: transaction.id, sourceProjectionId: transaction.sourceProjectionId, sourceCanonicalEventId: transaction.sourceCanonicalEventId, sourceClassification: transaction.accountingClassification, sourcePolicyCode: transaction.policyCode, disposalTimestamp: transaction.eventTimestamp, sourceMetadata: transaction.sourceMetadata ?? null }; }
export function fifoDisposition(transaction, disposition, reasonCode, details = {}){ return { id: `fifo-disposition:${FIFO_VERSION}:${transaction.id}`, fifoVersion: FIFO_VERSION, ...source(transaction), disposition, reasonCode, ...details }; }
function validItemId(value){ const text = String(value ?? ""); if (!/^\d+$/.test(text) || Number(text) <= 0) throw new Error("invalid_item_id"); return text; }
function quantity(value){ if (!Number.isInteger(value) || value <= 0) throw new Error("invalid_disposal_quantity"); return value; }
function money(value){ if (value === null || value === undefined) return null; if (!Number.isInteger(value) || value < 0) throw new Error("invalid_disposal_proceeds"); return value; }
export function disposalItemLines(transaction){ return (Array.isArray(transaction.lines) ? transaction.lines : []).filter((line) => line.movementDirection === "out" && (line.itemId !== null || line.quantity !== null)).sort((left, right) => Number(left.lineSequence) - Number(right.lineSequence) || String(left.id).localeCompare(String(right.id))); }
export function createDisposalDemands(transaction){
  const lines = disposalItemLines(transaction); if (!lines.length) throw new Error("missing_disposal_item_line"); const seenLines = new Set();
  return lines.map((line, occurrence) => {
    const sourceLineId = String(line.id ?? ""); if (!sourceLineId) throw new Error("missing_disposal_item_line"); if (seenLines.has(sourceLineId)) throw new Error("deterministic_identity_collision"); seenLines.add(sourceLineId);
    const itemId = validItemId(line.itemId); const originalDemandQuantity = quantity(line.quantity); const itemUid = line.itemUid === null || line.itemUid === undefined ? null : String(line.itemUid); if (itemUid && originalDemandQuantity !== 1) throw new Error("ambiguous_specific_item_identity");
    const id = `fifo-demand:${FIFO_VERSION}:${transaction.id}:${sourceLineId}:${itemId}:${itemUid ?? "fungible"}:${occurrence}`; const single = lines.length === 1; const proceedsTotal = single ? money(transaction.debitTotal) : null;
    return { id, fifoVersion: FIFO_VERSION, ...source(transaction), sourceLedgerLineId: sourceLineId, itemId, itemUid, originalDemandQuantity, matchedQuantity: 0, unmatchedQuantity: originalDemandQuantity, disposalSequence: `${String(transaction.eventTimestamp).padStart(12, "0")}:${transaction.sourceCanonicalEventId}:${transaction.id}:${String(occurrence).padStart(6, "0")}:${sourceLineId}`, occurrenceSequence: occurrence, demandStatus: FifoDemandStatus.pending, sourceTransactionProceeds: money(transaction.debitTotal), proceedsTotal, proceedsAllocationStatus: single ? "fully_attributable" : "allocation_deferred", reasonCode: null };
  });
}
export function validateDemand(demand){
  if (!demand.id || demand.fifoVersion !== FIFO_VERSION || !demand.sourceLedgerTransactionId || !demand.sourceLedgerLineId || !demand.sourceProjectionId || !demand.sourceCanonicalEventId) throw new Error("missing_source_disposal");
  validItemId(demand.itemId); quantity(demand.originalDemandQuantity); if (demand.itemUid && demand.originalDemandQuantity !== 1) throw new Error("ambiguous_specific_item_identity");
  if (!Number.isInteger(demand.matchedQuantity) || demand.matchedQuantity < 0 || !Number.isInteger(demand.unmatchedQuantity) || demand.unmatchedQuantity < 0 || demand.matchedQuantity + demand.unmatchedQuantity !== demand.originalDemandQuantity) throw new Error("demand_reconciliation_failed");
  if (!demandStatuses.has(demand.demandStatus) || !Number.isInteger(demand.disposalTimestamp) || !demand.disposalSequence) throw new Error("invalid_disposal_demand"); money(demand.proceedsTotal);
}
export function validateConsumption(record, demand, lot, consumedBefore){
  if (!record.id || record.fifoVersion !== FIFO_VERSION || record.disposalDemandId !== demand.id || record.sourceLotId !== lot.id) throw new Error("orphaned_consumption");
  if (record.sourceCostLotVersion !== lot.costLotVersion || record.sourceLedgerVersion !== demand.sourceLedgerVersion) throw new Error("fifo_source_version_mismatch");
  if (record.itemId !== demand.itemId || record.itemId !== lot.itemId) throw new Error("lot_item_mismatch"); if (demand.itemUid && (record.itemUid !== demand.itemUid || lot.itemUid !== demand.itemUid)) throw new Error("lot_uid_mismatch");
  quantity(record.consumedQuantity); if (consumedBefore + record.consumedQuantity > lot.originalQuantity) throw new Error("overconsumption_detected"); if (!matchTypes.has(record.matchType)) throw new Error("unknown_fifo_policy");
  if (record.consumedAllocatedBasis !== null && (!Number.isInteger(record.consumedAllocatedBasis) || record.consumedAllocatedBasis < 0)) throw new Error("basis_overallocation");
  if (record.lotAcquisitionTimestamp > record.disposalTimestamp) throw new Error("acquisition_after_disposal");
}
export function buildFifoSource(transaction){
  try { const policy = FIFO_SOURCE_POLICY_REGISTRY.find((candidate) => candidate.applies(transaction)); const result = policy ? policy.build(transaction, { createDisposalDemands, fifoDisposition, FifoDisposition }) : { demands: [], disposition: fifoDisposition(transaction, FifoDisposition.ineligible, "unknown_fifo_policy") }; if (result.disposition && !dispositions.has(result.disposition.disposition)) throw new Error("unknown_fifo_policy"); return result; }
  catch (error) { return { demands: [], disposition: fifoDisposition(transaction, FifoDisposition.error, error.message || "unsupported_disposal_semantics", { detail: error.message }) }; }
}
export function fifoPayload(value){ return stableStringify(value); }
