/**
 * Estimates the purchase cost of currently owned units from canonical data.
 *
 * Matching is newest acquisition first. Records with equal timestamps use a
 * descending acquisition-ID tiebreaker so results remain stable across runs.
 */
const SUPPORTED_SOURCES = new Set([
  "bazaar",
  "itemMarket",
  "cityShop",
  "abroadShop",
  "trade",
]);

function positiveQuantity(value){
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function sourceLabel(record){
  const names = {
    bazaar: "Bazaar",
    itemMarket: "Item Market",
    cityShop: "City Shop",
    abroadShop: "Abroad",
    trade: "Trade",
  };
  const name = names[record.sourceType] ?? record.sourceType;
  return record.sourceType === "abroadShop" && record.sourceLocation
    ? `Abroad - ${record.sourceLocation}`
    : name;
}

function eligibleLines(itemId, acquisitions){
  const uniqueAcquisitions = new Map();
  acquisitions.forEach((record) => {
    if (record?.id !== null && record?.id !== undefined && !uniqueAcquisitions.has(String(record.id))) {
      uniqueAcquisitions.set(String(record.id), record);
    }
  });

  return [...uniqueAcquisitions.values()]
    .filter((record) => SUPPORTED_SOURCES.has(record.sourceType))
    .flatMap((record) => record.itemLines
      .filter((line) => Number(line.itemId) === Number(itemId))
      .map((line) => ({ record, line })))
    .sort((left, right) =>
      right.record.timestamp - left.record.timestamp ||
      String(right.record.id).localeCompare(String(left.record.id)),
    );
}

function isResolvedPricedLot(record, line){
  return record.allocationStatus !== "unresolved" &&
    Number.isFinite(line.knownUnitCost) &&
    line.knownUnitCost >= 0;
}

/**
 * Pure current-holdings cost-basis calculator.
 */
export const CostBasisService = {
  calculate(ownedItem, acquisitions = []){
    if (!ownedItem || ownedItem.id === null || ownedItem.id === undefined) {
      throw new Error("Cost basis requires an OwnedItem.");
    }

    const currentQuantity = positiveQuantity(ownedItem.totalQuantity);
    const matchedLots = [];
    let remainingQuantity = currentQuantity;
    let matchedQuantity = 0;
    let pricedQuantity = 0;
    let unresolvedQuantity = 0;
    let totalKnownCost = 0;

    if (currentQuantity > 0) {
      eligibleLines(ownedItem.id, acquisitions).forEach(({ record, line }) => {
        if (remainingQuantity <= 0) return;

        const quantityAcquired = positiveQuantity(line.quantity);
        const quantityUsed = Math.min(quantityAcquired, remainingQuantity);
        const costResolved = isResolvedPricedLot(record, line);
        const knownUnitCost = costResolved ? Number(line.knownUnitCost) : null;
        const knownAllocatedCost = costResolved ? knownUnitCost * quantityUsed : null;

        matchedLots.push({
          acquisitionId: String(record.id),
          timestamp: Number(record.timestamp),
          source: sourceLabel(record),
          sourceType: record.sourceType,
          sourceLocation: record.sourceLocation ?? null,
          quantityAcquired,
          quantityUsed,
          knownUnitCost,
          knownAllocatedCost,
          costResolved,
          tradeId: record.tradeId ?? null,
          counterpartyId: record.counterpartyId ?? null,
        });

        matchedQuantity += quantityUsed;
        remainingQuantity -= quantityUsed;
        if (costResolved) {
          pricedQuantity += quantityUsed;
          totalKnownCost += knownAllocatedCost;
        } else {
          unresolvedQuantity += quantityUsed;
        }
      });
    }

    const unmatchedQuantity = Math.max(0, currentQuantity - matchedQuantity);
    const pricedLots = matchedLots.filter((lot) => lot.costResolved);
    const warnings = [];
    if (currentQuantity === 0) {
      warnings.push("Current quantity is zero.");
    }
    if (unmatchedQuantity > 0) {
      warnings.push("Known acquisition history does not account for all currently owned units. The imported history may not extend far enough back, or some units may have come from gifts, crimes, rewards, transfers, or other non-purchase sources.");
    }
    if (unresolvedQuantity > 0) {
      warnings.push("Some matched units came from unresolved acquisitions, such as multi-item trades.");
    }
    if (pricedQuantity === 0 && currentQuantity > 0) {
      warnings.push("No priced acquisitions were found for the currently owned units.");
    }
    warnings.push("This estimate uses newest known acquisitions to represent current holdings. It may not account for gifts, crimes, rewards, sales, item use, transfers, or other non-purchase movements.");

    return {
      itemId: ownedItem.id,
      currentQuantity,
      matchedQuantity,
      pricedQuantity,
      unresolvedQuantity,
      unmatchedQuantity,
      quantityCoveragePercent: currentQuantity ? matchedQuantity / currentQuantity * 100 : 0,
      pricedCoveragePercent: currentQuantity ? pricedQuantity / currentQuantity * 100 : 0,
      totalKnownCost: pricedQuantity ? totalKnownCost : null,
      weightedAverageUnitCost: pricedQuantity ? totalKnownCost / pricedQuantity : null,
      lowestKnownUnitCost: pricedLots.length ? Math.min(...pricedLots.map((lot) => lot.knownUnitCost)) : null,
      highestKnownUnitCost: pricedLots.length ? Math.max(...pricedLots.map((lot) => lot.knownUnitCost)) : null,
      oldestMatchedTimestamp: matchedLots.length ? Math.min(...matchedLots.map((lot) => lot.timestamp)) : null,
      newestMatchedTimestamp: matchedLots.length ? Math.max(...matchedLots.map((lot) => lot.timestamp)) : null,
      matchedLots,
      warnings,
      calculationTimestamp: Date.now(),
    };
  },
};
