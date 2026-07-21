import { stableStringify } from "../raw-log-serialization.js";

export const CANONICAL_SCHEMA_VERSION = 1;
const DIRECTIONS = new Set(["in", "out", "increase", "decrease", "create", "destroy", "transfer"]);

function finite(value){ return typeof value === "number" && Number.isFinite(value); }
function jsonValue(value){
  try { return stableStringify(value) !== undefined; } catch { return false; }
}
function ordered(list = []){
  return [...list].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

export class UnsupportedVariantError extends Error {
  constructor(message){ super(message); this.name = "UnsupportedVariantError"; }
}

export function canonicalEventId({ sourceLogId, parserName, parserVersion, outputIndex = 0 }){
  return `canonical:${sourceLogId}:${parserName}:${parserVersion}:${outputIndex}`;
}

export function validateMovement(movement){
  if (!movement || typeof movement !== "object") throw new Error("Canonical movement must be an object.");
  if (!DIRECTIONS.has(movement.direction)) throw new Error(`Invalid canonical movement direction: ${movement.direction}`);
  if (!String(movement.resourceType ?? "").trim()) throw new Error("Canonical movement requires a resourceType.");
  ["quantity", "amount"].forEach((field) => {
    if (movement[field] !== undefined && movement[field] !== null && !finite(movement[field])) throw new Error(`Canonical movement ${field} must be finite.`);
  });
  if (!jsonValue(movement.attributes ?? {})) throw new Error("Canonical movement attributes must be JSON-serializable.");
}

/** Validates and normalizes the stable, generic derived-event envelope. */
export function createCanonicalEvent(input){
  const event = {
    id: input.id ?? canonicalEventId(input),
    sourceLogId: String(input.sourceLogId ?? ""),
    eventTimestamp: Number(input.eventTimestamp),
    eventType: String(input.eventType ?? ""),
    parserName: String(input.parserName ?? ""),
    parserVersion: String(input.parserVersion ?? ""),
    schemaVersion: Number(input.schemaVersion ?? CANONICAL_SCHEMA_VERSION),
    actor: input.actor ?? null,
    counterparties: ordered(input.counterparties ?? []),
    movements: ordered(input.movements ?? []),
    attributes: input.attributes ?? {},
    sourceMetadata: input.sourceMetadata ?? {},
  };
  if (!event.sourceLogId || !Number.isFinite(event.eventTimestamp) || !event.eventType || !event.parserName || !event.parserVersion || !Number.isInteger(event.schemaVersion)) {
    throw new Error("Canonical event has missing or invalid envelope fields.");
  }
  event.movements.forEach(validateMovement);
  if (!jsonValue(event.attributes) || !jsonValue(event.sourceMetadata) || !jsonValue(event.actor) || !jsonValue(event.counterparties)) throw new Error("Canonical event contains non-serializable JSON data.");
  return event;
}
