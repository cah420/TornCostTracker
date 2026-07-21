/**
 * Generic inventory-conversion accounting. Source-specific decoding belongs
 * to PurchaseLogImporter; this service only receives canonical events.
 */
import { InventoryLedgerStore } from "../stores/inventory-ledger.js";
import { PurchaseStore } from "../stores/purchases.js";
import { MarketValueService } from "./market-value-service.js";
import { getActiveCostingStrategy } from "./analysis/costing-strategy.js";
import { Events } from "../events.js";

function number(value){
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value){
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : 0;
}

function cents(value){ return Math.round((number(value) ?? 0) * 100); }
function dollars(value){ return Math.round(value) / 100; }

function acquisitionLots(record){
  return record.itemLines.map((line, index) => {
    const known = ["known", "zero"].includes(record.costStatus) && number(line.knownUnitCost) !== null;
    return {
      id: `acquisition:${record.id}:${index}`,
      itemId: Number(line.itemId),
      timestamp: Number(record.timestamp),
      sourceId: String(record.id),
      originalQuantity: positive(line.quantity),
      remainingQuantity: positive(line.quantity),
      costStatus: known ? record.costStatus : record.costStatus === "nonCash" ? "nonCash" : "unresolved",
      unitCost: known ? number(line.knownUnitCost) : null,
      basisOriginal: known ? dollars(cents(line.knownUnitCost) * positive(line.quantity)) : null,
      basisRemaining: known ? dollars(cents(line.knownUnitCost) * positive(line.quantity)) : null,
    };
  });
}

function snapshotFor(outputs){
  return outputs.map((output) => {
    const value = MarketValueService.lookup(output.itemId);
    if (!value || value.effectiveValue === null) throw new Error(`No current effective value is available for output item #${output.itemId}.`);
    return { itemId: Number(output.itemId), quantity: positive(output.quantity), ...value };
  });
}

function allocateCents(totalCents, values){
  if (!values.length) return [];
  if (values.length === 1) return [totalCents];
  const totalValue = values.reduce((sum, value) => sum + cents(value.effectiveValue) * value.quantity, 0);
  if (totalValue <= 0) throw new Error("Conversion outputs require positive effective values for allocation.");
  const allocations = values.map((value) => Math.floor(totalCents * (cents(value.effectiveValue) * value.quantity) / totalValue));
  const remainder = totalCents - allocations.reduce((sum, value) => sum + value, 0);
  const highestIndex = values.reduce((best, value, index) => {
    const bestValue = cents(values[best].effectiveValue) * values[best].quantity;
    const nextValue = cents(value.effectiveValue) * value.quantity;
    return nextValue > bestValue || (nextValue === bestValue && Number(value.itemId) < Number(values[best].itemId)) ? index : best;
  }, 0);
  allocations[highestIndex] += remainder;
  return allocations;
}

function applyConversion({ lots, event, strategy }){
  let workingLots = structuredClone(lots);
  const consumedLots = [];
  let totalBasisConsumed = 0;
  let unresolvedQuantity = 0;
  let nonCashQuantity = 0;
  for (const input of event.inputItems) {
    const result = strategy.consume({ itemId: input.itemId, quantity: input.quantity, availableLots: workingLots, eventTimestamp: event.timestamp });
    if (!result.complete) {
      const error = new Error(`Insufficient tracked quantity for conversion input item #${input.itemId}.`);
      error.code = "INSUFFICIENT_TRACKED_QUANTITY";
      throw error;
    }
    workingLots = result.remainingLots;
    consumedLots.push(...result.consumedLots);
    totalBasisConsumed += result.totalBasisConsumed ?? 0;
    unresolvedQuantity += result.unresolvedQuantity;
    nonCashQuantity += result.nonCashQuantity;
  }

  const cashReceived = Math.max(0, number(event.cashReceived) ?? 0);
  const basisResolved = unresolvedQuantity === 0 && nonCashQuantity === 0;
  const basisCents = cents(totalBasisConsumed);
  const cashBasisRecoveredCents = basisResolved ? Math.min(cents(cashReceived), basisCents) : null;
  const allocatableBasisCents = basisResolved ? Math.max(0, basisCents - cashBasisRecoveredCents) : null;
  // A one-to-one conversion transfers basis directly and must remain usable
  // even when no current valuation is available. Multi-output allocation is
  // the only case that requires values.
  const marketSnapshot = event.outputItems.length > 1
    ? snapshotFor(event.outputItems)
    : event.outputItems.map((output) => ({
      itemId: Number(output.itemId),
      quantity: positive(output.quantity),
      ...(MarketValueService.lookup(output.itemId) ?? { marketPrice: null, vendorSellPrice: null, effectiveValue: null }),
    }));
  const allocations = basisResolved ? allocateCents(allocatableBasisCents, marketSnapshot) : marketSnapshot.map(() => null);
  const outputLots = event.outputItems.map((output, index) => {
    const allocation = allocations[index];
    const quantity = positive(output.quantity);
    const unitCost = allocation === null ? null : dollars(allocation) / quantity;
    return {
      id: `conversion:${event.id}:output:${index}`,
      itemId: Number(output.itemId),
      timestamp: Number(event.timestamp),
      sourceId: String(event.id),
      originalQuantity: quantity,
      remainingQuantity: quantity,
      costStatus: allocation === null ? "unresolved" : allocation === 0 ? "zero" : "known",
      unitCost,
      basisOriginal: allocation === null ? null : dollars(allocation),
      basisRemaining: allocation === null ? null : dollars(allocation),
    };
  });
  const cashOnly = !event.outputItems.length;
  const realizedGain = basisResolved ? Math.max(0, cents(cashReceived) - basisCents) : null;
  const realizedLoss = basisResolved && cashOnly ? Math.max(0, basisCents - cents(cashReceived)) : 0;
  const outputValuesKnown = marketSnapshot.every((value) => Number.isFinite(value.effectiveValue));
  const valueReceived = outputValuesKnown
    ? dollars(cents(cashReceived) + marketSnapshot.reduce((sum, value) => sum + cents(value.effectiveValue) * value.quantity, 0))
    : null;
  const record = {
    id: String(event.id),
    sourceLogId: String(event.sourceLogId),
    timestamp: Number(event.timestamp),
    inputItems: structuredClone(event.inputItems),
    inputLotsConsumed: consumedLots,
    originalCostBasis: basisResolved ? dollars(basisCents) : null,
    cashReceived,
    cashBasisRecovered: cashBasisRecoveredCents === null ? null : dollars(cashBasisRecoveredCents),
    outputItems: structuredClone(event.outputItems),
    marketSnapshot,
    allocationMethod: event.allocationMethod,
    allocatedOutputLots: outputLots,
    allocationStatus: basisResolved ? "resolved" : "unresolved",
    costingMethod: strategy.id,
    realizedGain: realizedGain === null ? null : dollars(realizedGain),
    realizedLoss: realizedLoss === null ? null : dollars(realizedLoss),
    valueReceived,
    // Informational market-snapshot comparison. It is intentionally separate
    // from realized cash gain/loss because item outputs may still be held.
    estimatedValueDelta: basisResolved && valueReceived !== null ? dollars(cents(valueReceived) - basisCents) : null,
    roundingAdjustment: basisResolved ? dollars(allocatableBasisCents - allocations.reduce((sum, value) => sum + value, 0)) : null,
  };
  return { lots: [...workingLots, ...outputLots], record };
}

function unresolvedConversionRecord(event, strategy, error){
  return {
    id: String(event.id),
    sourceLogId: String(event.sourceLogId),
    timestamp: Number(event.timestamp),
    inputItems: structuredClone(event.inputItems),
    inputLotsConsumed: [],
    originalCostBasis: null,
    cashReceived: Math.max(0, number(event.cashReceived) ?? 0),
    cashBasisRecovered: null,
    outputItems: structuredClone(event.outputItems),
    marketSnapshot: [],
    allocationMethod: event.allocationMethod,
    allocatedOutputLots: [],
    allocationStatus: "unresolved",
    costingMethod: strategy.id,
    realizedGain: null,
    realizedLoss: null,
    valueReceived: null,
    estimatedValueDelta: null,
    roundingAdjustment: null,
    skipReason: `${error.message} The conversion was recorded without consuming or creating cost lots.`,
  };
}

// Kept public for deterministic accounting tests; production callers use
// processPending so ledger persistence remains atomic.
export function applyConversionForTesting(input){ return applyConversion(input); }

function timeline(playerId, state){
  const processed = new Set(state.processedEventIds);
  const acquisitions = PurchaseStore.all(playerId)
    .map((record) => ({ id: `acquisition:${record.id}`, timestamp: record.timestamp, type: "acquisition", record }))
    .filter((entry) => !processed.has(entry.id));
  const conversions = state.conversionEvents
    .map((event) => ({ id: `conversion:${event.id}`, timestamp: event.timestamp, type: "conversion", event }))
    .filter((entry) => !processed.has(entry.id));
  return [...acquisitions, ...conversions].sort((left, right) =>
    left.timestamp - right.timestamp || left.type.localeCompare(right.type) || left.id.localeCompare(right.id),
  );
}

export const ConversionService = {
  async processPending(playerId){
    const snapshot = InventoryLedgerStore.snapshot(playerId);
    const processed = new Set(snapshot.processedEventIds);
    const pendingConversions = snapshot.conversionEvents.filter((event) => !processed.has(`conversion:${event.id}`));
    if (pendingConversions.length) {
      try {
        await MarketValueService.ensureLoaded();
      } catch (error) {
        // Direct one-output basis transfers can proceed without a valuation;
        // multi-output allocation cannot safely do so.
        if (pendingConversions.some((event) => event.outputItems.length > 1)) throw error;
      }
    }
    const strategy = getActiveCostingStrategy();
    const result = InventoryLedgerStore.transaction(playerId, (state) => {
      const pending = timeline(playerId, state);
      for (const entry of pending) {
        if (entry.type === "acquisition") {
          state.lots.push(...acquisitionLots(entry.record));
        } else {
          try {
            const applied = applyConversion({ lots: state.lots, event: entry.event, strategy });
            state.lots = applied.lots;
            if (!state.conversions.some((record) => String(record.id) === String(applied.record.id))) state.conversions.push(applied.record);
          } catch (error) {
            if (error?.code !== "INSUFFICIENT_TRACKED_QUANTITY") throw error;
            const unresolved = unresolvedConversionRecord(entry.event, strategy, error);
            if (!state.conversions.some((record) => String(record.id) === String(unresolved.id))) state.conversions.push(unresolved);
          }
        }
        state.processedEventIds.push(entry.id);
      }
      state.conversions.sort((left, right) => left.timestamp - right.timestamp || String(left.id).localeCompare(String(right.id)));
      return { processed: pending.length, conversions: structuredClone(state.conversions), lots: structuredClone(state.lots) };
    });
    if (result.processed) Events.emit("conversionLedgerUpdated", result);
    return result;
  },
};
