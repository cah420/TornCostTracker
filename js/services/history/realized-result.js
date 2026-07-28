import { stableStringify } from "../raw-log-serialization.js";

export const REALIZED_RESULT_VERSION = 1;

/** Builds a derived result without pretending unknown basis is zero. */
export function buildRealizedResult(consumption, { now = Date.now() } = {}){
  const proceeds = consumption.allocatedDisposalProceeds;
  const basis = consumption.consumedAllocatedBasis;
  const isSale = consumption.disposalType === "sale";
  const quantityComplete = consumption.disposalDemandStatus === undefined || consumption.disposalDemandStatus === "matched";
  const complete = quantityComplete && Number.isInteger(proceeds) && Number.isInteger(basis);
  return {
    id: `realized-result:${REALIZED_RESULT_VERSION}:${consumption.id}`,
    realizedResultVersion: REALIZED_RESULT_VERSION,
    fifoVersion: consumption.fifoVersion,
    sourceConsumptionId: consumption.id,
    sourceDisposalCanonicalEventId: consumption.sourceDisposalCanonicalEventId,
    sourceLotId: consumption.sourceLotId,
    itemId: consumption.itemId,
    itemUid: consumption.itemUid,
    quantity: consumption.consumedQuantity,
    disposalType: consumption.disposalType ?? "sale",
    allocatedNetProceeds: Number.isInteger(proceeds) ? proceeds : null,
    consumedBasis: Number.isInteger(basis) ? basis : null,
    realizedResult: isSale && complete ? proceeds - basis : null,
    resultStatus: !quantityComplete ? "incomplete_quantity" : !isSale ? (Number.isInteger(basis) ? "basis_consumed_non_sale" : "basis_unknown_non_sale") : complete ? "complete" : "incomplete_basis",
    occurredAt: consumption.disposalTimestamp,
    createdAt: now,
  };
}
export function realizedResultPayload(value){ return stableStringify(value); }
