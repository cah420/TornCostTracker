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

function locationsFor(locations = {}){
  return Object.fromEntries(
    OWNED_ITEM_LOCATIONS.map((location) => [location, quantity(locations[location])]),
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
    this.locations = locationsFor(locations);
    this.metadata = metadataFor(metadata);
    this.totalQuantity = this.calculateTotalQuantity();
  }

  calculateTotalQuantity(){
    return Object.values(this.locations).reduce((total, value) => total + value, 0);
  }

  setLocation(location, value){
    if (!OWNED_ITEM_LOCATIONS.includes(location)) {
      throw new Error(`Unknown item location: ${location}`);
    }

    this.locations[location] = quantity(value);
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
