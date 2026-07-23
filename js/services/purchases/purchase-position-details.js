const KNOWN_ALLOCATED = "known_allocated_basis";
const KNOWN_ZERO = "known_no_cash_consideration";
const DEFERRED = "known_group_basis_allocation_deferred";

function integer(value){ return Number.isInteger(Number(value)) ? Number(value) : 0; }
function identity(itemId, itemUid){ return `${itemId}:${itemUid ?? "fungible"}`; }

function lotBasisCategory(lot){
  if (lot.basisStatus === KNOWN_ZERO) return "known";
  if (lot.basisStatus === KNOWN_ALLOCATED && lot.originalAllocatedBasis !== null) return "known";
  if (lot.basisStatus === DEFERRED || lot.allocationStatus === "allocation_deferred") return "deferred";
  return "unknown";
}

function compareRational(left, right){
  const a = BigInt(left.numerator) * BigInt(right.denominator);
  const b = BigInt(right.numerator) * BigInt(left.denominator);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function deriveRemainingLot(lot){
  const originalQuantity = integer(lot.originalQuantity);
  const consumedQuantity = integer(lot.consumedQuantity);
  const remainingQuantity = Math.max(0, originalQuantity - consumedQuantity);
  const category = lotBasisCategory(lot);
  let remainingKnownBasis = null;
  if (category === "known") {
    remainingKnownBasis = lot.basisStatus === KNOWN_ZERO
      ? 0
      : Math.max(0, integer(lot.originalAllocatedBasis) - integer(lot.consumedKnownBasis));
  }
  return {
    ...lot,
    remainingQuantity,
    remainingKnownBasis,
    basisCategory: category,
    lotState: remainingQuantity === 0 ? "CLOSED" : consumedQuantity > 0 ? "PARTIAL" : "OPEN",
    unitBasisNumerator: remainingKnownBasis,
    unitBasisDenominator: category === "known" && remainingQuantity > 0 ? remainingQuantity : null,
    unitBasis: category === "known" && remainingQuantity > 0 ? remainingKnownBasis / remainingQuantity : null,
  };
}

export function basisCompleteness(position){
  if (!integer(position.remainingQuantity)) return "NONE";
  if (!integer(position.deferredQuantity) && !integer(position.unknownQuantity)) return "COMPLETE";
  if (integer(position.knownQuantity)) return "PARTIAL";
  if (integer(position.unknownQuantity)) return "UNKNOWN";
  return "DEFERRED";
}

export function compareCurrentQuantity(position, currentItem, itemPositions = []){
  if (!currentItem) return { state: "NOT_AVAILABLE", currentTornQuantity: null, difference: null };
  const comparable = position.itemUid === null && itemPositions.length === 1 && itemPositions[0].itemUid === null;
  if (!comparable) return { state: "NOT_COMPARABLE", currentTornQuantity: Number(currentItem.totalQuantity), difference: null };
  const currentTornQuantity = Number(currentItem.totalQuantity);
  const difference = integer(position.remainingQuantity) - currentTornQuantity;
  return { state: difference === 0 ? "MATCHED" : difference > 0 ? "ACCOUNTING_HIGHER" : "TORN_HIGHER", currentTornQuantity, difference };
}

export function createPurchasePositionDetails({ position, lots = [], basisLots = null, consumptions = [], itemPositions = [], currentItem = null, catalogName = null, unassignedEvidence = [], pagination = null }){
  const remainingLots = lots.map(deriveRemainingLot);
  const known = (basisLots ?? lots).map(deriveRemainingLot).filter((lot) => lot.remainingQuantity > 0 && lot.basisCategory === "known");
  const ratios = known.map((lot) => ({ numerator: lot.remainingKnownBasis, denominator: lot.remainingQuantity }));
  const lowest = ratios.length ? ratios.reduce((a, b) => compareRational(a, b) <= 0 ? a : b) : null;
  const highest = ratios.length ? ratios.reduce((a, b) => compareRational(a, b) >= 0 ? a : b) : null;
  const knownRemainingQuantity = integer(position.knownQuantity);
  const knownRemainingBasis = integer(position.knownBasis);
  const completeness = basisCompleteness(position);
  const warnings = [];
  if (completeness !== "COMPLETE" && completeness !== "NONE") warnings.push("The complete remaining cash basis is unavailable because some units have deferred or unknown basis.");
  if (position.positionHealth !== "HEALTHY") warnings.push(position.explanation?.health?.summary ?? "This accounting position contains projection warnings.");
  if (unassignedEvidence.length) warnings.push("Item-level unmatched disposal evidence exists. It is shown separately and has not been assigned to a UID position.");
  const currentQuantityComparison = compareCurrentQuantity(position, currentItem, itemPositions);
  return Object.freeze({
    id: position.id,
    positionId: position.id,
    identityKey: identity(position.itemId, position.itemUid),
    itemId: String(position.itemId),
    itemUid: position.itemUid ?? null,
    identityType: position.itemUid ? "UID" : "FUNGIBLE",
    itemName: catalogName || (position.itemName?.startsWith("Item #") ? null : position.itemName) || `Item #${position.itemId}`,
    positionVersion: position.positionVersion ?? 1,
    costLotVersion: position.sourceCostLotVersion ?? 1,
    fifoVersion: position.sourceFifoVersion ?? 1,
    originalQuantity: integer(position.originalQuantity),
    consumedQuantity: integer(position.consumedQuantity),
    remainingQuantity: integer(position.remainingQuantity),
    knownRemainingQuantity,
    deferredQuantity: integer(position.deferredQuantity),
    unknownQuantity: integer(position.unknownQuantity),
    deferredRemainingQuantity: integer(position.deferredQuantity),
    unknownRemainingQuantity: integer(position.unknownQuantity),
    knownRemainingBasis,
    completeRemainingBasis: completeness === "COMPLETE" ? knownRemainingBasis : null,
    basisCompleteness: completeness,
    lowestKnownUnitBasis: lowest ? lowest.numerator / lowest.denominator : null,
    highestKnownUnitBasis: highest ? highest.numerator / highest.denominator : null,
    weightedAverageKnownUnitBasis: knownRemainingQuantity > 0 ? knownRemainingBasis / knownRemainingQuantity : null,
    lowestKnownUnitCost: lowest ? lowest.numerator / lowest.denominator : null,
    highestKnownUnitCost: highest ? highest.numerator / highest.denominator : null,
    weightedAverageKnownUnitCost: knownRemainingQuantity > 0 ? knownRemainingBasis / knownRemainingQuantity : null,
    weightedAverageBasisRatio: knownRemainingQuantity > 0 ? { numerator: knownRemainingBasis, denominator: knownRemainingQuantity } : null,
    positionStatus: position.positionStatus,
    positionHealth: position.positionHealth,
    positionConfidence: position.positionConfidence,
    explanation: position.explanation ?? null,
    positionExplanation: position.explanation ?? null,
    openLotCount: integer(position.openLotCount),
    partialLotCount: integer(position.partiallyConsumedLotCount),
    closedLotCount: integer(position.fullyConsumedLotCount),
    firstAcquisitionTimestamp: position.firstAcquisitionTimestamp,
    lastAcquisitionTimestamp: position.lastAcquisitionTimestamp,
    currentQuantityComparison,
    remainingLots,
    consumptions,
    consumedLots: consumptions,
    unassignedEvidence,
    pagination,
    warnings,
    trace: {
      positionId: position.id,
      sourceLotIds: remainingLots.map((lot) => lot.lotId),
      sourceLedgerTransactionIds: [...new Set(remainingLots.map((lot) => lot.sourceLedgerTransactionId).filter(Boolean))],
      sourceCanonicalEventIds: [...new Set(remainingLots.map((lot) => lot.sourceCanonicalEventId).filter(Boolean))],
      consumptionIds: consumptions.map((row) => row.consumptionId),
    },
    traceReferences: [position.id, ...remainingLots.map((lot) => lot.lotId), ...consumptions.map((row) => row.consumptionId)].filter(Boolean),
    currentInventoryQuantity: currentQuantityComparison.currentTornQuantity,
    inventoryDifference: currentQuantityComparison.difference,
  });
}
