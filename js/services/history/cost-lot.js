import { stableStringify } from "../raw-log-serialization.js";
import { COST_LOT_POLICY_REGISTRY } from "./cost-lot-policies.js";

export const COST_LOT_VERSION = 2;
export const CostLotDisposition = Object.freeze({
  lotsCreated: "lots_created",
  deferredLotsCreated: "deferred_lots_created",
  noItemEntry: "no_item_entry",
  ineligible: "ineligible",
  unresolved: "unresolved",
  error: "lot_error",
});
export const CostLotGroupStatus = Object.freeze({ open: "open", deferred: "deferred", unresolved: "unresolved", error: "error" });
export const CostLotStatus = Object.freeze({ open: "open", deferred: "deferred", unresolved: "unresolved", error: "lot_error", partiallyConsumed: "partially_consumed", closed: "closed" });
export const CostLotBasisStatus = Object.freeze({
  knownAllocated: "known_allocated_basis",
  knownGroupDeferred: "known_group_basis_allocation_deferred",
  knownNoCash: "known_no_cash_consideration",
  unknown: "unknown_basis",
  notApplicable: "not_applicable",
  unresolved: "unresolved",
});
export const CostLotAllocationStatus = Object.freeze({ fullyAllocated: "fully_allocated", deferred: "allocation_deferred", notRequired: "allocation_not_required", unknown: "allocation_unknown", unresolved: "unresolved" });

const groupStatuses = new Set(Object.values(CostLotGroupStatus));
const groupTypes = new Set(["paid_acquisition", "non_cash_reward", "conversion_output", "deferred_acquisition", "unresolved_acquisition"]);
const lotStatuses = new Set([CostLotStatus.open, CostLotStatus.deferred, CostLotStatus.unresolved, CostLotStatus.error]);
const basisStatuses = new Set(Object.values(CostLotBasisStatus));
const allocationStatuses = new Set(Object.values(CostLotAllocationStatus));
const dispositions = new Set(Object.values(CostLotDisposition));

function groupId(transactionId, policyCode){ return `lot-group:${COST_LOT_VERSION}:${transactionId}:${policyCode}`; }
function lotId(parentId, lineId, itemId, uid, occurrence){ return `cost-lot:${COST_LOT_VERSION}:${parentId}:${lineId}:${itemId}:${uid ?? "fungible"}:${occurrence}`; }
function dispositionId(transactionId){ return `lot-disposition:${COST_LOT_VERSION}:${transactionId}`; }
function finiteMoney(value, field, { nullable = true } = {}){
  if (value === null || value === undefined) { if (nullable) return null; throw new Error(`${field} is required.`); }
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a nonnegative integer.`);
  return value;
}
function positiveQuantity(value){ if (!Number.isInteger(value) || value <= 0) throw new Error("invalid_quantity"); return value; }
function validItemId(value){ const text = String(value ?? ""); if (!/^\d+$/.test(text) || Number(text) <= 0) throw new Error("invalid_item_id"); return text; }
function itemEntryLines(transaction){
  const lines = Array.isArray(transaction.lines) ? transaction.lines : [];
  return lines.filter((line) => line.movementDirection === "in" && (line.itemId !== null || line.quantity !== null)).sort((left, right) => Number(left.lineSequence) - Number(right.lineSequence) || String(left.id).localeCompare(String(right.id)));
}
function sourceEnvelope(transaction){
  return { sourceLedgerVersion: transaction.ledgerVersion, sourceProjectionVersion: transaction.sourceProjectionVersion, sourceLedgerTransactionId: transaction.id, sourceProjectionId: transaction.sourceProjectionId, sourceCanonicalEventId: transaction.sourceCanonicalEventId, sourceAccountingClassification: transaction.accountingClassification, sourceLedgerPolicyCode: transaction.policyCode, eventTimestamp: transaction.eventTimestamp, sourceMetadata: transaction.sourceMetadata ?? null };
}
function makeDisposition(transaction, disposition, reasonCode, detail = null){
  return { id: dispositionId(transaction.id), costLotVersion: COST_LOT_VERSION, ...sourceEnvelope(transaction), disposition, reasonCode, detail };
}

export function createLotOutput(transaction, policyCode, definition){
  const candidates = definition.candidates ?? itemEntryLines(transaction);
  if (!candidates.length) throw new Error("missing_item_line");
  const parentId = groupId(transaction.id, policyCode);
  const seenUids = new Set(); const seenSourceLines = new Set();
  const lots = candidates.map((candidate, occurrence) => {
    const itemId = validItemId(candidate.itemId); const quantity = positiveQuantity(candidate.quantity); const uid = candidate.itemUid === null || candidate.itemUid === undefined ? null : String(candidate.itemUid);
    if (uid && seenUids.has(uid)) throw new Error("duplicate_item_uid");
    if (uid) seenUids.add(uid);
    const sourceLineId = String(candidate.id ?? ""); if (!sourceLineId) throw new Error("missing_source_line");
    if (seenSourceLines.has(sourceLineId)) throw new Error("deterministic_identity_collision"); seenSourceLines.add(sourceLineId);
    if (uid && quantity !== 1) throw new Error("item_identity_uncertain");
    const id = lotId(parentId, sourceLineId, itemId, uid, occurrence);
    const basis = definition.lotBasis?.(candidate, occurrence) ?? {};
    const originalTotalBasis = basis.originalTotalBasis ?? null; const allocatedBasis = basis.allocatedBasis ?? null; const unallocatedBasis = basis.unallocatedBasis ?? null; const unitBasis = basis.unitBasis ?? null;
    return { id, lotGroupId: parentId, costLotVersion: COST_LOT_VERSION, ...sourceEnvelope(transaction), sourceLedgerLineId: sourceLineId, itemId, itemUid: uid, originalQuantity: quantity, remainingQuantity: quantity, consumedQuantity: 0, lotStatus: definition.lotStatus, basisStatus: definition.lotBasisStatus, allocationStatus: definition.lotAllocationStatus, originalTotalBasis, allocatedBasis, unallocatedBasis, unitBasis, acquisitionTimestamp: transaction.eventTimestamp, acquisitionSequence: `${String(transaction.eventTimestamp).padStart(12, "0")}:${transaction.sourceCanonicalEventId}:${transaction.id}:${String(occurrence).padStart(6, "0")}:${id}`, occurrenceSequence: occurrence, participantReference: null, sourceLineReference: candidate.id, deferredReason: definition.deferredReason ?? null };
  });
  const originalTotalQuantity = lots.reduce((sum, lot) => sum + lot.originalQuantity, 0);
  const remainingTotalQuantity = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
  const group = { id: parentId, costLotVersion: COST_LOT_VERSION, ...sourceEnvelope(transaction), groupType: definition.groupType, groupStatus: definition.groupStatus, basisStatus: definition.groupBasisStatus, allocationStatus: definition.groupAllocationStatus, originalTotalBasis: definition.originalTotalBasis ?? null, allocatedTotalBasis: definition.allocatedTotalBasis ?? null, unallocatedTotalBasis: definition.unallocatedTotalBasis ?? null, currency: definition.currency ?? "Torn dollars", participantReferences: [], lotCount: lots.length, originalTotalQuantity, remainingTotalQuantity, deferredReason: definition.deferredReason ?? null, diagnosticReason: definition.diagnosticReason ?? null };
  validateLotGroup(group, lots);
  return { disposition: makeDisposition(transaction, definition.disposition, definition.dispositionReason), group, lots };
}

export function validateCostLot(lot){
  if (!lot.id || !lot.lotGroupId || lot.costLotVersion !== COST_LOT_VERSION || !Number.isInteger(lot.sourceLedgerVersion) || lot.sourceLedgerVersion <= 0 || !lot.sourceLedgerTransactionId || !lot.sourceLedgerLineId || !lot.sourceProjectionId || !lot.sourceCanonicalEventId) throw new Error("Cost lot identity or source reference is invalid.");
  validItemId(lot.itemId); positiveQuantity(lot.originalQuantity);
  if (lot.remainingQuantity !== lot.originalQuantity || lot.consumedQuantity !== 0) throw new Error("Cost lot initial quantities do not reconcile.");
  if (!lotStatuses.has(lot.lotStatus) || !basisStatuses.has(lot.basisStatus) || !allocationStatuses.has(lot.allocationStatus)) throw new Error("Cost lot uses an unknown controlled status.");
  ["originalTotalBasis", "allocatedBasis", "unallocatedBasis", "unitBasis"].forEach((field) => finiteMoney(lot[field], field));
  if (!lot.acquisitionSequence || !Number.isInteger(lot.occurrenceSequence)) throw new Error("Cost lot acquisition order is missing.");
}
export function validateLotGroup(group, lots){
  if (!group.id || group.costLotVersion !== COST_LOT_VERSION || !Number.isInteger(group.sourceLedgerVersion) || group.sourceLedgerVersion <= 0 || !Number.isInteger(group.sourceProjectionVersion) || group.sourceProjectionVersion <= 0 || !group.sourceLedgerTransactionId || !group.sourceProjectionId || !group.sourceCanonicalEventId || !Number.isInteger(group.eventTimestamp) || group.eventTimestamp < 0) throw new Error("Lot group identity or source is invalid.");
  if (!groupTypes.has(group.groupType)) throw new Error("Lot group uses an unknown group type.");
  if (!groupStatuses.has(group.groupStatus) || !basisStatuses.has(group.basisStatus) || !allocationStatuses.has(group.allocationStatus)) throw new Error("Lot group uses an unknown controlled status.");
  lots.forEach(validateCostLot);
  if (lots.some((lot) => lot.lotGroupId !== group.id || lot.sourceLedgerTransactionId !== group.sourceLedgerTransactionId)) throw new Error("Cost lot source does not match its parent group.");
  if (new Set(lots.map((lot) => lot.id)).size !== lots.length) throw new Error("deterministic_identity_collision");
  if (group.lotCount !== lots.length || group.originalTotalQuantity !== lots.reduce((sum, lot) => sum + lot.originalQuantity, 0) || group.remainingTotalQuantity !== lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0)) throw new Error("quantity_reconciliation_failed");
  const original = finiteMoney(group.originalTotalBasis, "originalTotalBasis"); const allocated = finiteMoney(group.allocatedTotalBasis, "allocatedTotalBasis"); const unallocated = finiteMoney(group.unallocatedTotalBasis, "unallocatedTotalBasis");
  if (original === null && (allocated !== null || unallocated !== null)) throw new Error("basis_reconciliation_failed");
  if (original !== null && (allocated === null || unallocated === null || allocated + unallocated !== original)) throw new Error("basis_reconciliation_failed");
  const childAllocated = lots.reduce((sum, lot) => sum + (lot.allocatedBasis ?? 0), 0);
  if (allocated !== null && childAllocated > allocated) throw new Error("basis_reconciliation_failed");
  if (group.allocationStatus === CostLotAllocationStatus.fullyAllocated && childAllocated !== original) throw new Error("basis_reconciliation_failed");
}

export function buildCostLotDisposition(transaction){
  const source = transaction && typeof transaction === "object" ? transaction : { id: "missing-ledger-transaction", ledgerVersion: 0, sourceProjectionVersion: 0, sourceProjectionId: "unknown", sourceCanonicalEventId: "unknown", eventTimestamp: 0, accountingClassification: "unknown", policyCode: "unknown", lines: [] };
  try {
    if (!source.id || !Number.isInteger(source.ledgerVersion) || source.ledgerVersion <= 0) throw new Error("missing_source_transaction");
    const policy = COST_LOT_POLICY_REGISTRY.find((candidate) => candidate.applies(source));
    if (!policy) return { disposition: makeDisposition(source, CostLotDisposition.ineligible, "unknown_policy"), group: null, lots: [] };
    const output = policy.build(source, { createLotOutput, makeDisposition, itemEntryLines, CostLotDisposition, CostLotGroupStatus, CostLotStatus, CostLotBasisStatus, CostLotAllocationStatus });
    if (!dispositions.has(output.disposition.disposition)) throw new Error("unknown_policy");
    return output;
  } catch (error) {
    return { disposition: makeDisposition(source, CostLotDisposition.error, error.message || "unsupported_ledger_shape", error.message), group: null, lots: [] };
  }
}
export function costLotPayload(value){ return stableStringify(value); }
