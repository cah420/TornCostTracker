export function createPlayer(p){return {id:p.id,name:p.name,level:p.level,rank:p.rank,factionID:p.faction_id,avatar:p.image};}

export const OWNED_ITEM_LOCATIONS = [
  "inventory",
  "bazaar",
  "itemMarket",
  "displayCase",
];

function quantity(value){
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function optionalNumber(value){
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function locationFor(value, timestamp){
  if (value && typeof value === "object") {
    return {
      quantity: quantity(value.quantity),
      updated: value.updated ?? timestamp,
    };
  }

  // Sprint 2 stored locations as quantities; preserve those cached records.
  return { quantity: quantity(value), updated: timestamp };
}

function locationsFor(locations = {}, timestamp = Date.now()){
  return Object.fromEntries(
    OWNED_ITEM_LOCATIONS.map((location) => [location, locationFor(locations[location], timestamp)]),
  );
}

function metadataFor(metadata = {}, timestamp = Date.now()){
  return {
    created: metadata.created ?? timestamp,
    lastUpdated: metadata.lastUpdated ?? timestamp,
    sources: [...new Set(metadata.sources ?? [])],
  };
}

/**
 * The canonical representation of an item owned across all supported locations.
 */
export class OwnedItem {
  constructor({ id, name = "", category = "", locations = {}, metadata = {} } = {}) {
    if (id === null || id === undefined || id === "") {
      throw new Error("OwnedItem requires an id.");
    }

    this.id = id;
    this.name = name;
    this.category = category;
    this.metadata = metadataFor(metadata);
    this.locations = locationsFor(locations, this.metadata.lastUpdated);
    this.totalQuantity = this.calculateTotalQuantity();
  }

  calculateTotalQuantity(){
    return Object.values(this.locations).reduce((total, location) => total + location.quantity, 0);
  }

  setLocation(location, value, updated = Date.now()){
    if (!OWNED_ITEM_LOCATIONS.includes(location)) {
      throw new Error(`Unknown item location: ${location}`);
    }

    this.locations[location] = { quantity: quantity(value), updated };
    this.totalQuantity = this.calculateTotalQuantity();
  }

  updateMetadata({ source, timestamp = Date.now() } = {}){
    this.metadata.lastUpdated = timestamp;
    if (source && !this.metadata.sources.includes(source)) {
      this.metadata.sources.push(source);
    }
  }

  removeSource(source){
    this.metadata.sources = this.metadata.sources.filter((itemSource) => itemSource !== source);
  }

  locationQuantity(location){
    return this.locations[location]?.quantity ?? 0;
  }

  static from(item, fallbackTimestamp = Date.now()){
    if (item?.locations) {
      return new OwnedItem({
        id: item.id,
        name: item.name,
        category: item.category,
        locations: item.locations,
        metadata: metadataFor(item.metadata, fallbackTimestamp),
      });
    }

    // Migrate cached inventory rows created before the OwnedItem model.
    return new OwnedItem({
      id: item.id ?? item.itemID,
      name: item.name,
      category: item.category,
      locations: { inventory: item.totalQuantity ?? item.quantity },
      metadata: {
        created: fallbackTimestamp,
        lastUpdated: fallbackTimestamp,
        sources: ["inventory"],
      },
    });
  }

  toJSON(){
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      totalQuantity: this.totalQuantity,
      locations: this.locations,
      metadata: this.metadata,
    };
  }
}

export const ACQUISITION_SOURCE_TYPES = Object.freeze([
  "bazaar",
  "itemMarket",
  "cityShop",
  "abroadShop",
  "trade",
  "playerGift",
  "factionGift",
  "crimeReward",
  "eventReward",
  "companyReward",
  "itemConversion",
  "other",
  "unknown",
]);

export const ACQUISITION_KINDS = Object.freeze(["paid", "free", "nonCash", "unresolved"]);
export const ACQUISITION_COST_STATUSES = Object.freeze(["known", "zero", "nonCash", "unresolved"]);

function acquisitionKindFor(value, allocationStatus){
  if (ACQUISITION_KINDS.includes(value)) return value;
  return allocationStatus === "unresolved" ? "unresolved" : "paid";
}

function costStatusFor(value, acquisitionKind){
  if (ACQUISITION_COST_STATUSES.includes(value)) return value;
  return {
    paid: "known",
    free: "zero",
    nonCash: "nonCash",
    unresolved: "unresolved",
  }[acquisitionKind];
}

/**
 * A Torn-neutral, canonical record of items acquired in one transaction.
 * Timestamps are Unix seconds because Torn logs use that resolution.
 */
export class Acquisition {
  constructor({
    id,
    timestamp,
    sourceType = "unknown",
    sourceLocation = null,
    counterpartyId = null,
    tradeId = null,
    totalCashCost = null,
    itemLines = [],
    allocationStatus = "resolved",
    acquisitionKind = null,
    costStatus = null,
    acquisitionMethod = null,
  } = {}) {
    if (id === null || id === undefined || id === "") {
      throw new Error("Acquisition requires a stable id.");
    }
    if (!Number.isFinite(Number(timestamp))) {
      throw new Error("Acquisition requires a timestamp.");
    }

    this.id = String(id);
    this.timestamp = Number(timestamp);
    this.sourceType = ACQUISITION_SOURCE_TYPES.includes(sourceType) ? sourceType : "unknown";
    this.sourceLocation = typeof sourceLocation === "string" && sourceLocation.trim() ? sourceLocation.trim() : null;
    this.counterpartyId = counterpartyId === null || counterpartyId === undefined ? null : Number(counterpartyId);
    this.tradeId = tradeId === null || tradeId === undefined || tradeId === "" ? null : String(tradeId);
    this.acquisitionKind = acquisitionKindFor(acquisitionKind, allocationStatus);
    this.costStatus = costStatusFor(costStatus, this.acquisitionKind);
    this.acquisitionMethod = ACQUISITION_SOURCE_TYPES.includes(acquisitionMethod)
      ? acquisitionMethod
      : this.sourceType;
    this.totalCashCost = this.costStatus === "zero" ? 0 : optionalNumber(totalCashCost);
    this.itemLines = itemLines
      .map((line) => ({
        itemId: line?.itemId === null || line?.itemId === undefined ? null : Number(line.itemId),
        quantity: quantity(line?.quantity),
        knownUnitCost: this.costStatus === "zero" ? 0 : optionalNumber(line?.knownUnitCost),
        knownLineTotal: this.costStatus === "zero" ? 0 : optionalNumber(line?.knownLineTotal),
      }))
      .filter((line) => line.itemId !== null && line.quantity > 0);
    if (!this.itemLines.length) {
      throw new Error("Acquisition requires at least one item line.");
    }
    this.allocationStatus = this.acquisitionKind === "unresolved" || allocationStatus === "unresolved"
      ? "unresolved"
      : "resolved";
  }

  static from(record){
    return new Acquisition(record);
  }

  toJSON(){
    return {
      id: this.id,
      timestamp: this.timestamp,
      sourceType: this.sourceType,
      sourceLocation: this.sourceLocation,
      counterpartyId: this.counterpartyId,
      tradeId: this.tradeId,
      totalCashCost: this.totalCashCost,
      itemLines: this.itemLines,
      allocationStatus: this.allocationStatus,
      acquisitionKind: this.acquisitionKind,
      costStatus: this.costStatus,
      acquisitionMethod: this.acquisitionMethod,
    };
  }
}
