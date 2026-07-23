import { Database } from "../../database/database-client.js";
import { InventoryPositionRepository } from "../../database/inventory-position-repository.js";
import { PurchasesQueryRepository } from "../../database/purchases-query-repository.js";
import { ItemStore } from "../../stores/items.js";
import { ItemCatalogStore } from "../../stores/item-catalog.js";
import { INVENTORY_POSITION_VERSION } from "../history/inventory-position.js";
import { COST_LOT_VERSION } from "../history/cost-lot.js";
import { FIFO_VERSION } from "../history/fifo-consumption.js";
import { basisCompleteness, createPurchasePositionDetails } from "./purchase-position-details.js";

function selectorRow(position, name){
  return {
    id: position.id,
    itemId: String(position.itemId),
    itemUid: position.itemUid ?? null,
    identityType: position.itemUid ? "UID" : "Fungible",
    itemName: name || (position.itemName?.startsWith("Item #") ? null : position.itemName) || `Item #${position.itemId}`,
    remainingQuantity: Number(position.remainingQuantity),
    knownRemainingBasis: Number(position.knownBasis),
    basisCompleteness: basisCompleteness(position),
    status: position.positionStatus,
    health: position.positionHealth,
    confidence: Number(position.positionConfidence),
    firstAcquisitionTimestamp: position.firstAcquisitionTimestamp,
    lastAcquisitionTimestamp: position.lastAcquisitionTimestamp,
  };
}

export class PurchasesQueryService {
  constructor({ database = Database, positions = new InventoryPositionRepository(database), purchases = new PurchasesQueryRepository(database), itemStore = ItemStore, catalog = ItemCatalogStore, positionVersion = INVENTORY_POSITION_VERSION, costLotVersion = COST_LOT_VERSION, fifoVersion = FIFO_VERSION } = {}){
    this.database = database;
    this.positions = positions;
    this.purchases = purchases;
    this.itemStore = itemStore;
    this.catalog = catalog;
    this.positionVersion = positionVersion;
    this.costLotVersion = costLotVersion;
    this.fifoVersion = fifoVersion;
    this.sequences = new Map();
    this.metrics = { source: "sqlite", legacyAccountingCacheReads: 0, queryCount: 0, lastDurationMs: null, lastResultCount: 0, lastError: null };
  }

  nextRequest(scope = "default"){
    const value = (this.sequences.get(scope) ?? 0) + 1;
    this.sequences.set(scope, value);
    return value;
  }
  isCurrent(requestId, scope = "default"){ return requestId === this.sequences.get(scope); }

  async readiness(){
    const initialized = await this.database.initialize();
    if (!initialized.available) return { ready: false, reason: initialized.reason, source: "sqlite" };
    const run = await this.positions.latestRun(this.positionVersion);
    if (!run || run.status !== "completed") return { ready: false, reason: run?.status === "running" ? "Inventory Position rebuild is currently in progress. Wait for it to complete before using Purchases." : "Build Inventory Position in Settings before using Purchases.", source: "sqlite", run };
    const compatible = Number(run.source_cost_lot_version) === this.costLotVersion && Number(run.source_fifo_version) === this.fifoVersion;
    if (!compatible) return { ready: false, reason: "Inventory Position source versions do not match the Purchases query model. Rebuild the accounting projections in Settings.", source: "sqlite", run };
    return { ready: true, source: "sqlite", run };
  }

  catalogMap(){ return new Map(this.catalog.all().map((item) => [String(item.id), item.name])); }

  async loadKnownBasisLots(identity){
    const rows = []; const limit = 500;
    while (true) {
      const page = await this.purchases.listRemainingKnownBasisRatios({ ...identity, limit, offset: rows.length });
      rows.push(...page);
      if (page.length < limit) return rows;
    }
  }

  async listPositions(options = {}){
    const startedAt = performance.now();
    try {
      const ready = await this.readiness();
      if (!ready.ready) return { ...ready, rows: [], total: 0 };
      const search = String(options.search ?? "").trim();
      const catalog = this.catalogMap();
      const itemIds = search ? [...catalog.entries()].filter(([, name]) => name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(([id]) => id) : [];
      const query = { ...options, search: search || null, itemIds };
      const [positions, total] = await Promise.all([
        this.positions.listOwnedPositions(this.positionVersion, query),
        this.positions.countOwnedPositions(this.positionVersion, query),
      ]);
      const rows = positions.map((position) => selectorRow(position, catalog.get(String(position.itemId))));
      this.metrics = { ...this.metrics, queryCount: this.metrics.queryCount + 1, lastDurationMs: performance.now() - startedAt, lastResultCount: rows.length, lastError: null };
      return { ready: true, source: "sqlite", rows, total, limit: Number(options.limit) || 100, offset: Number(options.offset) || 0 };
    } catch (error) {
      this.metrics = { ...this.metrics, queryCount: this.metrics.queryCount + 1, lastDurationMs: performance.now() - startedAt, lastResultCount: 0, lastError: error.message };
      throw error;
    }
  }

  async getDetails(positionId, { lotLimit = 250, lotOffset = 0, consumptionLimit = 250, consumptionOffset = 0 } = {}){
    const startedAt = performance.now();
    try {
      const ready = await this.readiness();
      if (!ready.ready) throw new Error(ready.reason);
      const position = await this.positions.getPositionById(this.positionVersion, positionId);
      if (!position) return null;
      const identity = { costLotVersion: this.costLotVersion, fifoVersion: this.fifoVersion, itemId: position.itemId, itemUid: position.itemUid };
      const [lots, lotTotal, basisLots, consumptions, consumptionTotal, itemPositions, unassignedEvidence] = await Promise.all([
        this.purchases.listLotsByPositionIdentity({ ...identity, limit: lotLimit, offset: lotOffset }),
        this.purchases.countLotsByPositionIdentity(identity),
        this.loadKnownBasisLots(identity),
        this.purchases.listConsumptionsByPositionIdentity({ ...identity, limit: consumptionLimit, offset: consumptionOffset }),
        this.purchases.countConsumptionsByPositionIdentity(identity),
        this.positions.getPositionsByItemId(this.positionVersion, position.itemId),
        position.itemUid ? this.purchases.itemLevelUnassignedEvidence(this.fifoVersion, position.itemId) : Promise.resolve([]),
      ]);
      const currentItem = this.itemStore.items().find((item) => String(item.id) === String(position.itemId)) ?? null;
      const pagination = { lotLimit, lotOffset, lotTotal, consumptionLimit, consumptionOffset, consumptionTotal };
      const details = createPurchasePositionDetails({ position, lots, basisLots, consumptions, itemPositions, currentItem, catalogName: this.catalog.nameFor(position.itemId), unassignedEvidence, pagination });
      this.metrics = { ...this.metrics, queryCount: this.metrics.queryCount + 1, lastDurationMs: performance.now() - startedAt, lastResultCount: lots.length + consumptions.length, lastError: null };
      return details;
    } catch (error) {
      this.metrics = { ...this.metrics, queryCount: this.metrics.queryCount + 1, lastDurationMs: performance.now() - startedAt, lastResultCount: 0, lastError: error.message };
      throw error;
    }
  }

  async health(){
    const ready = await this.readiness();
    const counts = ready.ready ? await Promise.all([
      this.positions.countOwnedPositions(this.positionVersion),
      this.positions.countOwnedPositions(this.positionVersion, { basisCompleteness: "COMPLETE" }),
    ]) : [0, 0];
    const incompletePositions = counts[0] - counts[1];
    return { ...this.metrics, ready: ready.ready, healthState: !ready.ready ? "UNHEALTHY" : incompletePositions ? "WARNING" : "HEALTHY", reason: ready.reason ?? null, positionRunAvailable: Boolean(ready.run), versionCompatible: ready.ready, positionVersion: this.positionVersion, costLotVersion: this.costLotVersion, fifoVersion: this.fifoVersion, remainingPositions: counts[0], incompletePositions };
  }
}

export const PurchasesQueries = new PurchasesQueryService();
