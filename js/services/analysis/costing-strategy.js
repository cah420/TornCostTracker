/**
 * Cost-consumption strategies operate on immutable lot snapshots.
 * FIFO is the only active method in this release.
 */
function number(value){
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value){
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : 0;
}

function sortLots(lots){
  return [...lots].sort((left, right) =>
    Number(left.timestamp) - Number(right.timestamp) || String(left.id).localeCompare(String(right.id)),
  );
}

export const FIFO_COSTING_METHOD = "fifo";

export const FifoCostingStrategy = {
  id: FIFO_COSTING_METHOD,
  consume({ itemId, quantity, availableLots = [] } = {}){
    let remaining = positive(quantity);
    const relevantLots = sortLots(availableLots.filter((lot) =>
      Number(lot.itemId) === Number(itemId) && positive(lot.remainingQuantity) > 0,
    ));
    const remainingLots = structuredClone(availableLots);
    const byId = new Map(remainingLots.map((lot) => [String(lot.id), lot]));
    const consumedLots = [];
    let totalBasisConsumed = 0;
    let unresolvedQuantity = 0;
    let nonCashQuantity = 0;

    for (const lot of relevantLots) {
      if (remaining <= 0) break;
      const quantityConsumed = Math.min(positive(lot.remainingQuantity), remaining);
      const target = byId.get(String(lot.id));
      const basisKnown = ["known", "zero"].includes(lot.costStatus) && number(lot.unitCost) !== null;
      const basisConsumed = basisKnown ? Math.round(number(lot.unitCost) * quantityConsumed * 100) / 100 : null;
      target.remainingQuantity = positive(target.remainingQuantity) - quantityConsumed;
      target.basisRemaining = basisKnown
        ? Math.max(0, Math.round((number(target.basisRemaining) - basisConsumed) * 100) / 100)
        : null;
      consumedLots.push({
        lotId: String(lot.id),
        itemId: Number(lot.itemId),
        quantityConsumed,
        unitCost: basisKnown ? number(lot.unitCost) : null,
        basisConsumed,
        costStatus: lot.costStatus,
      });
      if (basisKnown) totalBasisConsumed += basisConsumed;
      else if (lot.costStatus === "nonCash") nonCashQuantity += quantityConsumed;
      else unresolvedQuantity += quantityConsumed;
      remaining -= quantityConsumed;
    }

    return {
      costingMethod: FIFO_COSTING_METHOD,
      consumedLots,
      totalQuantityConsumed: positive(quantity) - remaining,
      totalBasisConsumed: unresolvedQuantity || nonCashQuantity ? null : Math.round(totalBasisConsumed * 100) / 100,
      unresolvedQuantity,
      nonCashQuantity,
      complete: remaining === 0,
      insufficientQuantity: remaining > 0,
      remainingLots,
    };
  },
};

export function getActiveCostingStrategy(){
  return FifoCostingStrategy;
}
