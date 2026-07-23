import { stableStringify } from "../raw-log-serialization.js";

export const INVENTORY_POSITION_VERSION = 1;
export const InventoryPositionStatus = Object.freeze({ normal: "NORMAL", partial: "PARTIAL", deferred: "DEFERRED", unknown: "UNKNOWN", negative: "NEGATIVE", error: "ERROR" });
export const InventoryPositionHealth = Object.freeze({ healthy: "HEALTHY", warning: "WARNING", unhealthy: "UNHEALTHY" });

const knownAllocated = "known_allocated_basis";
const knownNoCash = "known_no_cash_consideration";
const deferredBasis = "known_group_basis_allocation_deferred";

function integer(value, fallback = 0){ return Number.isInteger(value) ? value : fallback; }
function itemId(value){ const text = String(value ?? ""); if (!/^\d+$/.test(text) || Number(text) <= 0) throw new Error("missing_position_identity"); return text; }
function uid(value){ return value === null || value === undefined || value === "" ? null : String(value); }
function identityKey(id, itemUid){ return `${id}:${itemUid ?? "fungible"}`; }
export function inventoryPositionId(id, itemUid = null, version = INVENTORY_POSITION_VERSION){ return `inventory-position:${version}:${itemId(id)}:${uid(itemUid) ?? "fungible"}`; }

function diagnostic(reasonCode, position, { quantity = null, basis = null, detail = null } = {}){
  return {
    id: `inventory-position-diagnostic:${position.positionVersion}:${position.id}:${reasonCode}`,
    positionVersion: position.positionVersion,
    reasonCode,
    itemId: position.itemId,
    itemUid: position.itemUid,
    positionId: position.id,
    supportingQuantity: quantity,
    supportingBasis: basis,
    detail,
    timestamp: position.lastAcquisitionTimestamp,
  };
}

function createPosition(lot, versions){
  const id = itemId(lot.itemId); const itemUid = uid(lot.itemUid);
  return {
    id: inventoryPositionId(id, itemUid, versions.positionVersion),
    positionVersion: versions.positionVersion,
    itemId: id,
    itemName: `Item #${id}`,
    itemUid,
    sourceCostLotVersion: versions.costLotVersion,
    sourceFifoVersion: versions.fifoVersion,
    sourceLedgerVersion: integer(lot.sourceLedgerVersion),
    sourceProjectionVersion: integer(lot.sourceProjectionVersion),
    firstAcquisitionTimestamp: integer(lot.acquisitionTimestamp),
    lastAcquisitionTimestamp: integer(lot.acquisitionTimestamp),
    originalQuantity: 0,
    consumedQuantity: 0,
    remainingQuantity: 0,
    originalBasis: null,
    consumedBasis: null,
    remainingBasis: null,
    knownQuantity: 0,
    deferredQuantity: 0,
    unknownQuantity: 0,
    knownBasis: 0,
    deferredBasis: 0,
    fifoReadyQuantity: 0,
    uidQuantity: 0,
    fungibleQuantity: 0,
    openLotCount: 0,
    partiallyConsumedLotCount: 0,
    fullyConsumedLotCount: 0,
    lotCount: 0,
    positionStatus: InventoryPositionStatus.normal,
    positionHealth: InventoryPositionHealth.healthy,
    positionConfidence: 100,
    confidenceDeductions: {},
    createdTimestamp: integer(lot.acquisitionTimestamp),
    firstSourceLotId: lot.id,
    lastSourceLotId: lot.id,
    historicalShortfallQuantity: 0,
    uidAmbiguityCount: 0,
    remainingQuantityIndeterminate: false,
    _knownOriginalBasis: 0,
    _knownConsumedBasis: 0,
    _hasUnknownOriginalBasis: false,
    _hasUnknownConsumedBasis: false,
    _hasUnknownRemainingBasis: false,
    _errors: [],
    _firstSequence: lot.acquisitionSequence,
    _lastSequence: lot.acquisitionSequence,
  };
}

export function createInventoryPositionAccumulator(versions = {}){
  return {
    versions: {
      positionVersion: versions.positionVersion ?? INVENTORY_POSITION_VERSION,
      costLotVersion: versions.costLotVersion ?? 1,
      fifoVersion: versions.fifoVersion ?? 1,
    },
    positions: new Map(),
    uidOwners: new Map(),
    uidConflicts: new Set(),
    sourceLotIds: new Set(),
    diagnostics: [],
    consumptionsExamined: 0,
  };
}

function basisCategory(lot){
  if (lot.basisStatus === knownAllocated && Number.isInteger(lot.allocatedBasis) && lot.allocatedBasis >= 0) return "known";
  if (lot.basisStatus === knownNoCash) return "known_zero";
  if (lot.basisStatus === deferredBasis || lot.allocationStatus === "allocation_deferred") return "deferred";
  return "unknown";
}

export function addLotToInventoryPosition(context, lot, consumption = {}){
  if (!lot?.id || context.sourceLotIds.has(lot.id)) throw new Error(lot?.id ? "duplicate_source_lot" : "missing_source_lot");
  context.sourceLotIds.add(lot.id);
  if (lot.costLotVersion !== context.versions.costLotVersion) throw new Error("unknown_cost_lot_version");
  const id = itemId(lot.itemId); const itemUid = uid(lot.itemUid); const key = identityKey(id, itemUid);
  let position = context.positions.get(key); if (!position) { position = createPosition(lot, context.versions); context.positions.set(key, position); }
  if (itemUid) {
    const owner = context.uidOwners.get(itemUid);
    if (owner && owner !== id) context.uidConflicts.add(itemUid);
    else context.uidOwners.set(itemUid, id);
  }
  if (position.sourceLedgerVersion !== integer(lot.sourceLedgerVersion)) position._errors.push("unknown_ledger_version");
  if (position.sourceProjectionVersion !== integer(lot.sourceProjectionVersion)) position._errors.push("unknown_projection_version");
  if (position.sourceLedgerVersion <= 0) position._errors.push("unknown_ledger_version");
  if (position.sourceProjectionVersion <= 0) position._errors.push("unknown_projection_version");
  const original = integer(lot.originalQuantity, -1); const consumed = integer(consumption.consumedQuantity); const consumptionCount = integer(consumption.consumptionCount); const consumedKnownBasis = integer(consumption.consumedBasis);
  context.consumptionsExamined += consumptionCount;
  if (original < 0 || consumed < 0) position._errors.push("quantity_reconciliation_failure");
  const remaining = original - consumed;
  if (consumed > original) position._errors.push("consumed_exceeds_original");
  if (remaining < 0) position._errors.push("negative_remaining_quantity");
  if (remaining > original) position._errors.push("remaining_exceeds_original");
  position.originalQuantity += original; position.consumedQuantity += consumed; position.remainingQuantity += remaining;
  position.firstAcquisitionTimestamp = Math.min(position.firstAcquisitionTimestamp, integer(lot.acquisitionTimestamp));
  position.lastAcquisitionTimestamp = Math.max(position.lastAcquisitionTimestamp, integer(lot.acquisitionTimestamp));
  position.createdTimestamp = position.firstAcquisitionTimestamp;
  if (String(lot.acquisitionSequence ?? "") <= String(position._firstSequence ?? "")) { position._firstSequence = lot.acquisitionSequence; position.firstSourceLotId = lot.id; }
  if (String(lot.acquisitionSequence ?? "") >= String(position._lastSequence ?? "")) { position._lastSequence = lot.acquisitionSequence; position.lastSourceLotId = lot.id; }
  position.lotCount += 1;
  if (remaining === original) position.openLotCount += 1;
  else if (remaining === 0) position.fullyConsumedLotCount += 1;
  else if (remaining > 0 && remaining < original) position.partiallyConsumedLotCount += 1;
  const category = basisCategory(lot);
  if (category === "known" || category === "known_zero") {
    const originalKnownBasis = category === "known_zero" ? 0 : lot.allocatedBasis;
    if (category === "known" && integer(consumption.nullBasisCount) > 0) position._errors.push("basis_reconciliation_failure");
    const consumedBasis = category === "known_zero" ? 0 : consumedKnownBasis;
    const remainingKnownBasis = originalKnownBasis - consumedBasis;
    if (remainingKnownBasis < 0) position._errors.push("negative_remaining_basis");
    position._knownOriginalBasis += originalKnownBasis; position._knownConsumedBasis += consumedBasis; position.knownBasis += remainingKnownBasis; position.knownQuantity += remaining;
  } else if (category === "deferred") {
    position.deferredQuantity += remaining; position._hasUnknownOriginalBasis = true; if (consumed) position._hasUnknownConsumedBasis = true; if (remaining) position._hasUnknownRemainingBasis = true;
  } else {
    position.unknownQuantity += remaining; position._hasUnknownOriginalBasis = true; if (consumed) position._hasUnknownConsumedBasis = true; if (remaining) position._hasUnknownRemainingBasis = true;
  }
  if (remaining > 0 && lot.lotStatus === "open" && lot.allocationStatus === "fully_allocated" && lot.basisStatus === knownAllocated && lot.unitBasis !== null) position.fifoReadyQuantity += remaining;
  if (itemUid) position.uidQuantity += remaining; else position.fungibleQuantity += remaining;
  return position;
}

function warningMap(warnings){
  const map = new Map();
  warnings.forEach((warning) => map.set(identityKey(itemId(warning.itemId), uid(warning.itemUid)), warning));
  return map;
}
function warningFor(map, position){
  const exact = map.get(identityKey(position.itemId, position.itemUid));
  return { historicalShortfallQuantity: integer(exact?.historicalShortfallQuantity), uidAmbiguityCount: integer(exact?.uidAmbiguityCount) };
}
function confidenceFor(position){
  const deductions = {}; const remaining = Math.max(position.remainingQuantity, 0);
  if (remaining && position.deferredQuantity) deductions.deferredBasis = Math.max(1, Math.ceil(15 * position.deferredQuantity / remaining));
  if (remaining && position.unknownQuantity) deductions.unknownBasis = Math.max(1, Math.ceil(25 * position.unknownQuantity / remaining));
  if (position.historicalShortfallQuantity > 0) deductions.historicalShortfall = Math.max(1, Math.ceil(15 * position.historicalShortfallQuantity / Math.max(1, remaining + position.historicalShortfallQuantity)));
  if (position.uidAmbiguityCount > 0) deductions.uidAmbiguity = 10;
  if (position.remainingQuantityIndeterminate) deductions.quantityIndeterminate = 40;
  if (position._errors.length) deductions.projectionError = 100;
  return { value: Math.max(0, Math.min(100, 100 - Object.values(deductions).reduce((sum, value) => sum + value, 0))), deductions };
}
const reasonText = Object.freeze({
  partial_lot: "Remaining inventory spans at least one partially consumed Cost Lot.",
  deferred_basis: "Some remaining quantity has known consideration that cannot yet be allocated safely.",
  unknown_basis: "Some remaining quantity has no safely known cash basis.",
  historical_shortfall: "Archived acquisitions do not fully cover attributable historical disposal demand.",
  uid_ambiguity: "Specific item identity could not be reconstructed from the available UID evidence.",
  fully_reconciled: "Quantity, basis, lot state, and source references reconcile.",
  quantity_indeterminate: "Remaining inventory quantity cannot be determined from the available evidence.",
  projection_inconsistency: "The Position contains an impossible value or failed an integrity rule.",
});
function explanationReason(code, category, supporting = {}){ return { code, category, message: reasonText[code] ?? `Projection integrity failure: ${code}.`, supporting }; }
function explanationFor(position, uniqueErrors){
  const reasons = [];
  if (position.partiallyConsumedLotCount) reasons.push(explanationReason("partial_lot", "inventory_state", { lots: position.partiallyConsumedLotCount }));
  if (position.deferredQuantity) reasons.push(explanationReason("deferred_basis", "accounting_certainty", { quantity: position.deferredQuantity }));
  if (position.unknownQuantity) reasons.push(explanationReason("unknown_basis", "accounting_certainty", { quantity: position.unknownQuantity }));
  if (position.historicalShortfallQuantity) reasons.push(explanationReason("historical_shortfall", "historical_completeness", { quantity: position.historicalShortfallQuantity }));
  if (position.uidAmbiguityCount) reasons.push(explanationReason("uid_ambiguity", "identity_evidence", { occurrences: position.uidAmbiguityCount }));
  if (position.remainingQuantityIndeterminate) reasons.push(explanationReason("quantity_indeterminate", "inventory_state"));
  uniqueErrors.forEach((code) => reasons.push(explanationReason(code, "projection_integrity")));
  if (!reasons.length) reasons.push(explanationReason("fully_reconciled", "projection_integrity"));
  const warningReasons = reasons.filter((row) => ["accounting_certainty", "historical_completeness", "identity_evidence"].includes(row.category)).map((row) => row.code);
  const statusReasons = position.positionStatus === InventoryPositionStatus.normal ? [position.remainingQuantity === 0 ? "fully_consumed" : "known_remaining_quantity"] : position.positionStatus === InventoryPositionStatus.partial ? ["partial_lot"] : position.positionStatus === InventoryPositionStatus.deferred ? [position.unknownQuantity ? "unknown_basis" : "deferred_basis"] : position.positionStatus === InventoryPositionStatus.unknown ? ["quantity_indeterminate"] : uniqueErrors;
  const healthReasons = position.positionHealth === InventoryPositionHealth.unhealthy ? ["projection_inconsistency", ...uniqueErrors] : position.positionHealth === InventoryPositionHealth.warning ? warningReasons : ["fully_reconciled"];
  return {
    status: { value: position.positionStatus, reasons: [...new Set(statusReasons)], summary: position.positionStatus === InventoryPositionStatus.unknown ? "Remaining inventory quantity is indeterminate." : position.positionStatus === InventoryPositionStatus.deferred ? "Remaining quantity is known, but some basis is incomplete." : position.positionStatus === InventoryPositionStatus.partial ? "Remaining quantity is known and includes partially consumed lots." : position.positionStatus === InventoryPositionStatus.normal ? "Remaining inventory quantity is deterministically known." : "Projection integrity requires investigation." },
    health: { value: position.positionHealth, reasons: [...new Set(healthReasons)], summary: position.positionHealth === InventoryPositionHealth.unhealthy ? "Projection integrity failed." : position.positionHealth === InventoryPositionHealth.warning ? "Projection integrity is sound, with historical or basis limitations." : "Projection integrity is sound with no identified limitations." },
    confidence: { value: position.positionConfidence, deductions: position.confidenceDeductions, summary: `${position.positionConfidence}% accounting confidence after ${Object.keys(position.confidenceDeductions).length ? "documented evidence deductions" : "no deductions"}.` },
    warningReasons: [...new Set(warningReasons)], reasons,
  };
}

export function finalizeInventoryPositions(context, warnings = []){
  const warningsByIdentity = warningMap(warnings); const diagnostics = [...context.diagnostics];
  const positions = [...context.positions.values()].sort((left, right) => Number(left.itemId) - Number(right.itemId) || String(left.itemUid ?? "").localeCompare(String(right.itemUid ?? "")));
  positions.forEach((position) => {
    if (position.itemUid && context.uidConflicts.has(position.itemUid)) position._errors.push("uid_identity_conflict");
    const warning = warningFor(warningsByIdentity, position);
    position.historicalShortfallQuantity = warning.historicalShortfallQuantity;
    position.uidAmbiguityCount = warning.uidAmbiguityCount;
    if (position.originalQuantity !== position.consumedQuantity + position.remainingQuantity) position._errors.push("quantity_reconciliation_failure");
    if (position.openLotCount + position.partiallyConsumedLotCount + position.fullyConsumedLotCount !== position.lotCount) position._errors.push("quantity_reconciliation_failure");
    position.originalBasis = position._hasUnknownOriginalBasis ? null : position._knownOriginalBasis;
    position.consumedBasis = position._hasUnknownConsumedBasis ? null : position._knownConsumedBasis;
    position.remainingBasis = position._hasUnknownRemainingBasis ? null : position.knownBasis;
    position.knownOriginalBasis = position._knownOriginalBasis;
    position.knownConsumedBasis = position._knownConsumedBasis;
    position.deferredBasis = position.deferredQuantity ? null : 0;
    if (position.originalBasis !== null && position.consumedBasis !== null && position.remainingBasis !== null && position.originalBasis !== position.consumedBasis + position.remainingBasis) position._errors.push("basis_reconciliation_failure");
    const uniqueErrors = [...new Set(position._errors)];
    uniqueErrors.forEach((reason) => diagnostics.push(diagnostic(reason, position, { quantity: position.remainingQuantity, basis: position.remainingBasis, detail: `Position ${position.id} failed ${reason}.` })));
    const confidence = confidenceFor(position); position.positionConfidence = confidence.value; position.confidenceDeductions = confidence.deductions;
    const negative = position.remainingQuantity < 0 || (position.remainingBasis !== null && position.remainingBasis < 0);
    position.remainingQuantityIndeterminate = Boolean(position.remainingQuantityIndeterminate);
    if (negative) position.positionStatus = InventoryPositionStatus.negative;
    else if (uniqueErrors.length) position.positionStatus = InventoryPositionStatus.error;
    else if (position.remainingQuantityIndeterminate) position.positionStatus = InventoryPositionStatus.unknown;
    else if (position.deferredQuantity > 0 || position.unknownQuantity > 0) position.positionStatus = InventoryPositionStatus.deferred;
    else if (position.partiallyConsumedLotCount > 0) position.positionStatus = InventoryPositionStatus.partial;
    else position.positionStatus = InventoryPositionStatus.normal;
    const hasHistoricalLimitations = position.deferredQuantity > 0 || position.unknownQuantity > 0 || position.historicalShortfallQuantity > 0 || position.uidAmbiguityCount > 0 || position.remainingQuantityIndeterminate;
    position.positionHealth = uniqueErrors.length || negative ? InventoryPositionHealth.unhealthy : hasHistoricalLimitations ? InventoryPositionHealth.warning : InventoryPositionHealth.healthy;
    position.explanation = explanationFor(position, uniqueErrors);
    delete position._knownOriginalBasis; delete position._knownConsumedBasis; delete position._hasUnknownOriginalBasis; delete position._hasUnknownConsumedBasis; delete position._hasUnknownRemainingBasis; delete position._errors; delete position._firstSequence; delete position._lastSequence;
  });
  if (new Set(positions.map((position) => position.id)).size !== positions.length) throw new Error("duplicate_position_identity");
  return { positions, diagnostics, consumptionsExamined: context.consumptionsExamined };
}

export function inventoryPositionPayload(value){ return stableStringify(value); }
