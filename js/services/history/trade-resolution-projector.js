import { createCanonicalEvent } from "./canonical-event.js";

export const TRADE_RESOLUTION_PROJECTOR_VERSION = "1.0.0";

/** Converts one active immutable resolution into paid acquisition events. */
export function projectTradeResolution(resolution){
  if (!resolution?.isActive || resolution.status !== "active") return [];
  const events = [];
  resolution.allocations.forEach((allocation, allocationIndex) => {
    allocation.lots.forEach((lot, lotIndex) => {
      const attributes = lot.uid ? { uid: String(lot.uid) } : {};
      events.push(createCanonicalEvent({
        id: `canonical:trade-resolution:${resolution.id}:${allocationIndex}:${lotIndex}`,
        sourceLogId: resolution.completionSourceLogId,
        eventTimestamp: resolution.tradeTimestamp,
        eventType: "acquisition",
        parserName: "trade-resolution-projector",
        parserVersion: TRADE_RESOLUTION_PROJECTOR_VERSION,
        counterparties: resolution.counterpartyId ? [{ role: "trade_partner", entityType: "player", entityId: String(resolution.counterpartyId) }] : [],
        movements: [
          { direction: "in", resourceType: "item", resourceId: String(allocation.itemId), quantity: lot.quantity, unit: "item", role: "purchased", attributes },
          { direction: "out", resourceType: "cash", amount: lot.allocatedBasis, unit: "dollar", role: "consideration", attributes: {} },
        ],
        attributes: {
          mechanic: "trade_resolution",
          tradeId: resolution.tradeId,
          tradeResolutionId: resolution.id,
          resolutionVersion: resolution.resolutionVersion,
          resolutionMethod: resolution.resolutionMethod,
          allocationIndex,
          lotIndex,
        },
        sourceMetadata: {
          source: "trade_resolution",
          tradeId: resolution.tradeId,
          tradeResolutionId: resolution.id,
          resolutionVersion: resolution.resolutionVersion,
        },
      }));
    });
  });
  return events;
}
