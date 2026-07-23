import assert from "node:assert/strict";
import { COST_LOT_VERSION } from "../history/cost-lot.js";
import { FIFO_VERSION } from "../history/fifo-consumption.js";
import { PurchasesQueryService } from "./purchases-query-service.js";

const base = { id: "p1", itemId: "1", itemUid: null, itemName: "Item #1", originalQuantity: 10, consumedQuantity: 2, remainingQuantity: 8, knownQuantity: 8, deferredQuantity: 0, unknownQuantity: 0, knownBasis: 80, positionStatus: "PARTIAL", positionHealth: "HEALTHY", positionConfidence: 100 };
class Positions {
  async latestRun(){ return { status: "completed", source_cost_lot_version: COST_LOT_VERSION, source_fifo_version: FIFO_VERSION }; }
  async listOwnedPositions(_version, options){ this.options = options; return [base]; }
  async countOwnedPositions(){ return 1; }
  async getPositionById(){ return base; }
  async getPositionsByItemId(){ return [base]; }
}
class Purchases { async listLotsByPositionIdentity(){ return [{ lotId: "l1", itemId: "1", itemUid: null, originalQuantity: 10, originalAllocatedBasis: 100, basisStatus: "known_allocated_basis", allocationStatus: "fully_allocated", consumedQuantity: 2, consumedKnownBasis: 20 }]; } async countLotsByPositionIdentity(){ return 1; } async listRemainingKnownBasisRatios(){ return this.listLotsByPositionIdentity(); } async listConsumptionsByPositionIdentity(){ return [{ consumptionId: "c1", consumedQuantity: 2 }]; } async countConsumptionsByPositionIdentity(){ return 1; } async itemLevelUnassignedEvidence(){ return []; } }
const positions = new Positions();
const service = new PurchasesQueryService({ database: { initialize: async () => ({ available: true }) }, positions, purchases: new Purchases(), itemStore: { items: () => [{ id: 1, totalQuantity: 8 }] }, catalog: { all: () => [{ id: 1, name: "Catalog Name" }], nameFor: () => "Catalog Name" } });
const list = await service.listPositions({ search: "catalog", limit: 25, offset: 0 });
assert.equal(list.ready, true); assert.equal(list.rows[0].itemName, "Catalog Name"); assert.deepEqual(positions.options.itemIds, ["1"]); assert.equal(service.metrics.legacyAccountingCacheReads, 0);
const repeated = await service.listPositions({ search: "catalog", health: "HEALTHY", includeConsumed: true, limit: 25, offset: 25 }); assert.deepEqual(repeated.rows, list.rows); assert.equal(positions.options.offset, 25); assert.equal(positions.options.includeConsumed, true);
const detail = await service.getDetails("p1"); assert.equal(detail.remainingQuantity, 8); assert.equal(detail.completeRemainingBasis, 80); assert.equal(detail.trace.sourceLotIds[0], "l1");
const first = service.nextRequest(); const second = service.nextRequest(); assert.equal(service.isCurrent(first), false); assert.equal(service.isCurrent(second), true);
const health = await service.health(); assert.equal(health.ready, true); assert.equal(health.source, "sqlite"); assert.equal(health.legacyAccountingCacheReads, 0);
const notReady = new PurchasesQueryService({ database: { initialize: async () => ({ available: false, reason: "no opfs" }) }, positions, purchases: new Purchases(), itemStore: { items: () => [] }, catalog: { all: () => [], nameFor: () => null } });
assert.deepEqual(await notReady.listPositions(), { ready: false, reason: "no opfs", source: "sqlite", rows: [], total: 0 });
const noRun = new PurchasesQueryService({ database: { initialize: async () => ({ available: true }) }, positions: { latestRun: async () => null }, purchases: new Purchases(), itemStore: { items: () => [] }, catalog: { all: () => [], nameFor: () => null } });
assert.match((await noRun.readiness()).reason, /Build Inventory Position/);
const failure = new PurchasesQueryService({ database: { initialize: async () => ({ available: true }) }, positions: { latestRun: async () => ({ status: "completed", source_cost_lot_version: COST_LOT_VERSION, source_fifo_version: FIFO_VERSION }), listOwnedPositions: async () => { throw new Error("repository failed"); }, countOwnedPositions: async () => 0 }, purchases: new Purchases(), itemStore: { items: () => [] }, catalog: { all: () => [], nameFor: () => null } });
await assert.rejects(() => failure.listPositions(), /repository failed/); assert.equal(failure.metrics.lastError, "repository failed");
console.log("SQLite Purchases query service readiness, filtering, detail, and stale-request tests passed.");
