import assert from "node:assert/strict";
import { ItemResolutionError, ItemResolutionService, normalizeItemIdentifier, resolveItemId } from "./item-resolution-service.js";

const virusIds = new Map([
  ["a simple", 69],
  ["a polymorphic", 70],
  ["a tunneling", 71],
  ["a armored", 72],
  ["a stealth", 73],
  ["a firewalk", 103],
]);

virusIds.forEach((itemId, identifier) => {
  assert.equal(resolveItemId({ source: "virus", identifier }), itemId);
  assert.equal(ItemResolutionService.resolveItemId({ source: " VIRUS ", identifier: `  ${identifier.toUpperCase()}  ` }), itemId);
});
assert.equal(normalizeItemIdentifier("  a   polymorphic  "), "a polymorphic");
assert.throws(() => resolveItemId({ source: "virus", identifier: "an unknown" }), (error) => error instanceof ItemResolutionError && error.code === "unknown_identifier");
assert.throws(() => resolveItemId({ source: "virus", identifier: "" }), (error) => error instanceof ItemResolutionError && error.code === "invalid_identifier");
assert.throws(() => resolveItemId({ source: "future-source", identifier: "known-looking" }), (error) => error instanceof ItemResolutionError && error.code === "unknown_source");
console.log("Item Resolution service deterministic tests passed.");
