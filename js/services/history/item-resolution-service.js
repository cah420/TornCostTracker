const ITEM_RESOLUTION_TABLES = Object.freeze({
  virus: Object.freeze({
    "a simple": 69,
    "a polymorphic": 70,
    "a tunneling": 71,
    "a armored": 72,
    "a stealth": 73,
    "a firewalk": 103,
  }),
});

export class ItemResolutionError extends Error {
  constructor(code, message, { source = null, identifier = null } = {}){
    super(message);
    this.name = "ItemResolutionError";
    this.code = code;
    this.source = source;
    this.identifier = identifier;
  }
}

export function normalizeItemIdentifier(identifier){
  if (typeof identifier !== "string") {
    throw new ItemResolutionError("invalid_identifier", "Item resolution requires a string identifier.", { identifier });
  }
  const normalized = identifier.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!normalized) {
    throw new ItemResolutionError("invalid_identifier", "Item resolution requires a non-empty identifier.", { identifier });
  }
  return normalized;
}

/**
 * Resolves a Torn source-specific identifier to one canonical Torn item ID.
 * This pure registry is independent from the display-only, asynchronous Item Catalog.
 */
export function resolveItemId({ source, identifier } = {}){
  const normalizedSource = String(source ?? "").trim().toLocaleLowerCase();
  const table = ITEM_RESOLUTION_TABLES[normalizedSource];
  if (!table) {
    throw new ItemResolutionError("unknown_source", `No item-resolution source is registered for "${normalizedSource || "unknown"}".`, { source: normalizedSource, identifier });
  }
  const normalizedIdentifier = normalizeItemIdentifier(identifier);
  const itemId = table[normalizedIdentifier];
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new ItemResolutionError("unknown_identifier", `Unknown ${normalizedSource} item identifier "${normalizedIdentifier}".`, { source: normalizedSource, identifier: normalizedIdentifier });
  }
  return itemId;
}

export const ItemResolutionService = Object.freeze({
  resolveItemId,
});
