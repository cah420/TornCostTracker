import { createCanonicalEvent } from "./canonical-event.js";

export const DISPOSAL_RESOLUTION_PROJECTOR_VERSION = "1.0.0";

/** Converts only one active immutable Disposal Resolution into sale events. */
export function projectDisposalResolution(resolution){
  if (!resolution?.isActive || resolution.status !== "active") return [];
  const events = [];
  resolution.allocations.forEach((allocation, allocationIndex) => {
    allocation.lots.forEach((lot, lotIndex) => {
      const itemAttributes = lot.uid ? { uid: String(lot.uid) } : {};
      events.push(createCanonicalEvent({
        id: `canonical:disposal-resolution:${resolution.id}:${allocationIndex}:${lotIndex}`,
        sourceLogId: resolution.completionSourceLogId,
        eventTimestamp: resolution.transactionTimestamp,
        eventType: "disposal",
        parserName: "disposal-resolution-projector",
        parserVersion: DISPOSAL_RESOLUTION_PROJECTOR_VERSION,
        counterparties: resolution.counterpartyId ? [{ role: "trade_partner", entityType: "player", entityId: String(resolution.counterpartyId) }] : [],
        movements: [
          { direction: "out", resourceType: "item", resourceId: String(allocation.itemId), quantity: lot.quantity, unit: "item", role: "sold", attributes: itemAttributes },
          { direction: "in", resourceType: "cash", amount: lot.allocatedProceeds, unit: "dollar", role: "net_proceeds", attributes: {} },
        ],
        attributes: {
          mechanic: "disposal_resolution",
          disposalType: "sale",
          sourceTransactionId: resolution.sourceTransactionId,
          disposalResolutionId: resolution.id,
          resolutionVersion: resolution.resolutionVersion,
          resolutionMethod: resolution.resolutionMethod,
          grossProceeds: lot.allocatedProceeds,
          fees: 0,
          netProceeds: lot.allocatedProceeds,
          proceedsStatus: "known",
          allocationIndex,
          lotIndex,
        },
        sourceMetadata: {
          source: "disposal_resolution",
          sourceTransactionId: resolution.sourceTransactionId,
          disposalResolutionId: resolution.id,
          resolutionVersion: resolution.resolutionVersion,
        },
      }));
    });
  });
  return events;
}
