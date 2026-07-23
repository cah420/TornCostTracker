import { createCanonicalEvent, UnsupportedVariantError } from "../canonical-event.js";
import { ItemResolutionError, resolveItemId } from "../item-resolution-service.js";
import { titleFor, typeFor } from "./torn-log-fields.js";

function sourceMetadata(log){ return { logType: typeFor(log), title: titleFor(log), category: log.category ?? log.details?.category ?? null }; }
function positiveInteger(value, field){
  if (!Number.isInteger(value) || value <= 0) throw new UnsupportedVariantError(`${field} must be a positive integer.`);
  return value;
}
function exactFields(rawLog, fields, parserName){
  const data = rawLog?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new UnsupportedVariantError(`${parserName} has an unsupported payload structure.`);
  const actual = Object.keys(data).sort(); const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) throw new UnsupportedVariantError(`${parserName} has an unsupported payload signature.`);
  return data;
}
function itemMovement(itemId, quantity = 1, uid = null, role = "acquired"){
  const id = positiveInteger(itemId, "item ID"); const qty = positiveInteger(quantity, "item quantity");
  const normalizedUid = uid === 0 || uid === null || uid === undefined ? null : String(uid);
  if (normalizedUid && qty !== 1) throw new UnsupportedVariantError("A UID-bearing item must have quantity one.");
  return { direction: "in", resourceType: "item", resourceId: String(id), quantity: qty, unit: "item", role, attributes: normalizedUid ? { uid: normalizedUid } : {} };
}
function itemMovements(data, item){
  if (item.kind === "scalar") return [itemMovement(data[item.field], item.quantityField ? data[item.quantityField] : 1)];
  if (item.kind === "two-scalars") return item.fields.map((field) => itemMovement(data[field], 1));
  if (item.kind === "map") {
    const value = data[item.field];
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new UnsupportedVariantError(`${item.field} must be an item quantity map.`);
    const rows = Object.entries(value).map(([id, quantity]) => itemMovement(Number(id), quantity));
    if (!rows.length) throw new UnsupportedVariantError(`${item.field} contains no items.`);
    return rows;
  }
  if (item.kind === "array") {
    const value = data[item.field];
    if (!Array.isArray(value) || !value.length) throw new UnsupportedVariantError(`${item.field} must be a non-empty item array.`);
    return value.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new UnsupportedVariantError(`${item.field} contains an invalid item row.`);
      const allowed = ["id", "qty", "uid"]; const actual = Object.keys(row).sort();
      if (actual.some((field) => !allowed.includes(field)) || !actual.includes("id") || !actual.includes("qty")) throw new UnsupportedVariantError(`${item.field} contains an unsupported item row signature.`);
      return itemMovement(row.id, row.qty, row.uid);
    });
  }
  throw new UnsupportedVariantError("Parser has no supported item decoder.");
}
function participant(role, entityType, value){
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) throw new UnsupportedVariantError(`${role} is invalid.`);
  return { role, entityType, entityId: String(value) };
}

/** One exact Torn log ID and one observed payload contract per parser instance. */
export function createInboundInventoryParser({ name, logType, title, signature, item, canonicalType, basisPolicy, consideration = null, attributes = null, counterparty = null }){
  return Object.freeze({
    name, version: "1.0.0", family: canonicalType === "non_cash_acquisition" ? "Acquisition" : "Reward",
    matches: (log) => typeFor(log) === logType && titleFor(log).toLocaleLowerCase() === title.toLocaleLowerCase(),
    parse({ sourceLogId, rawLog }){
      const data = exactFields(rawLog, signature, name);
      const movements = itemMovements(data, item);
      const counterparties = counterparty ? [participant(counterparty.role, counterparty.entityType, data[counterparty.field])] : [];
      return [createCanonicalEvent({
        sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: canonicalType, parserName: name, parserVersion: "1.0.0",
        counterparties, movements,
        attributes: { mechanic: name, basisPolicy, ...(consideration ? { consideration: { resourceType: consideration.resourceType, amount: positiveInteger(data[consideration.field], consideration.field) } } : {}), ...(attributes ? attributes(data) : {}) },
        sourceMetadata: sourceMetadata(rawLog),
      })];
    },
  });
}

export function createReviewOnlyParser({ name, logType, title, signature, attributes }){
  return Object.freeze({
    name, version: "1.0.0", family: "Review Required",
    matches: (log) => typeFor(log) === logType && titleFor(log).toLocaleLowerCase() === title.toLocaleLowerCase(),
    parse({ sourceLogId, rawLog }){
      const data = exactFields(rawLog, signature, name);
      return [createCanonicalEvent({
        sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "activity", parserName: name, parserVersion: "1.0.0",
        movements: [], attributes: { mechanic: name, reviewRequired: true, reason: "no_verified_torn_item_id", ...attributes(data) },
        sourceMetadata: sourceMetadata(rawLog),
      })];
    },
  });
}

export const TradeItemsIncomingParser = Object.freeze({
  name: "trade-items-incoming", version: "2.0.0", family: "Trade", coverageStatus: "partial", supersedesParserNames: ["trade"],
  matches: (log) => typeFor(log) === 4446 && /^trade items incoming$/i.test(titleFor(log)),
  parse({ sourceLogId, rawLog }){
    const data = exactFields(rawLog, ["items", "parsed_trade_id", "trade_id", "user"], "trade-items-incoming");
    const tradeId = positiveInteger(data.parsed_trade_id, "parsed_trade_id");
    const itemEvidence = itemMovements(data, { kind: "array", field: "items" }).map((movement) => ({ ...movement, direction: "transfer", role: "trade_evidence" }));
    return [createCanonicalEvent({
      sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "activity", parserName: "trade-items-incoming", parserVersion: "2.0.0",
      counterparties: [participant("trade_partner", "player", data.user)], movements: itemEvidence,
      attributes: { mechanic: "trade_items_incoming", tradeId, correlationRequired: true },
      sourceMetadata: sourceMetadata(rawLog),
    })];
  },
});

export function createVirusProgrammingParser({ itemResolver = resolveItemId } = {}){
  return Object.freeze({
    name: "virus-programming-complete", version: "2.0.0", family: "Reward",
    matches: (log) => typeFor(log) === 5802 && /^virus programming complete$/i.test(titleFor(log)),
    parse({ sourceLogId, rawLog }){
      const data = exactFields(rawLog, ["virus"], "virus-programming-complete");
      let itemId;
      try { itemId = itemResolver({ source: "virus", identifier: data.virus }); }
      catch (error) {
        if (error instanceof ItemResolutionError) throw new UnsupportedVariantError(`virus-programming-complete item resolution failed: ${error.code}.`);
        throw error;
      }
      return [createCanonicalEvent({
        sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "reward", parserName: "virus-programming-complete", parserVersion: "2.0.0",
        movements: [itemMovement(itemId, 1, null, "programmed")],
        attributes: { mechanic: "virus_programming_complete", basisPolicy: "zero_cash", itemResolution: { source: "virus", identifier: String(data.virus) } },
        sourceMetadata: sourceMetadata(rawLog),
      })];
    },
  });
}

export const VirusProgrammingParser = createVirusProgrammingParser();

export const AcquisitionCoverageParsers = Object.freeze([
  createInboundInventoryParser({ name: "legacy-dump-find", logType: 1401, title: "Dump find (legacy)", signature: ["dumper", "energy_used", "item"], item: { kind: "scalar", field: "item" }, canonicalType: "reward", basisPolicy: "zero_cash", attributes: (data) => ({ energyUsed: positiveInteger(data.energy_used, "energy_used") }) }),
  createInboundInventoryParser({ name: "dump-find", logType: 1404, title: "Dump find", signature: ["dumper", "energy_used", "item"], item: { kind: "array", field: "item" }, canonicalType: "reward", basisPolicy: "zero_cash", attributes: (data) => ({ energyUsed: positiveInteger(data.energy_used, "energy_used") }) }),
  createReviewOnlyParser({ name: "halloween-treat-receive", logType: 2536, title: "Halloween treat receive", signature: ["treats", "type"], attributes: (data) => ({ resourceType: "halloween_treat", quantity: positiveInteger(data.treats, "treats"), sourceType: String(data.type) }) }),
  TradeItemsIncomingParser,
  createInboundInventoryParser({ name: "keepsake-purchase", logType: 4850, title: "Keepsake purchase", signature: ["keepsake_received", "points_used"], item: { kind: "scalar", field: "keepsake_received" }, canonicalType: "non_cash_acquisition", basisPolicy: "unknown", consideration: { field: "points_used", resourceType: "points" } }),
  createInboundInventoryParser({ name: "referral-reward", logType: 5251, title: "Referral reward", signature: ["donator_days", "item", "item2", "level", "points", "user"], item: { kind: "two-scalars", fields: ["item", "item2"] }, canonicalType: "reward", basisPolicy: "unknown", counterparty: { field: "user", role: "referred_player", entityType: "player" } }),
  createInboundInventoryParser({ name: "stock-special-item", logType: 5530, title: "Stock special item", signature: ["item", "stock"], item: { kind: "map", field: "item" }, canonicalType: "reward", basisPolicy: "unknown", attributes: (data) => ({ stockId: positiveInteger(data.stock, "stock") }) }),
  createInboundInventoryParser({ name: "subscription-reward", logType: 5575, title: "Subscription reward", signature: ["first_item", "second_item"], item: { kind: "two-scalars", fields: ["first_item", "second_item"] }, canonicalType: "reward", basisPolicy: "unknown" }),
  VirusProgrammingParser,
  createInboundInventoryParser({ name: "job-special-gain-item", logType: 6401, title: "Job special gain item", signature: ["item", "job_points", "job_points_used", "quantity", "special_used"], item: { kind: "scalar", field: "item", quantityField: "quantity" }, canonicalType: "non_cash_acquisition", basisPolicy: "unknown", consideration: { field: "job_points_used", resourceType: "job_points" } }),
  createInboundInventoryParser({ name: "company-special-gain-item", logType: 6505, title: "Company special gain item", signature: ["item", "job_points", "job_points_used", "special_used"], item: { kind: "map", field: "item" }, canonicalType: "non_cash_acquisition", basisPolicy: "unknown", consideration: { field: "job_points_used", resourceType: "job_points" } }),
  createInboundInventoryParser({ name: "faction-payout-item-receive", logType: 6797, title: "Faction payout item receive", signature: ["faction", "items", "percentage", "replay", "role", "scenario", "sender"], item: { kind: "map", field: "items" }, canonicalType: "reward", basisPolicy: "unknown", counterparty: { field: "faction", role: "source_faction", entityType: "faction" }, attributes: (data) => ({ scenario: String(data.scenario), role: String(data.role), replayId: positiveInteger(data.replay, "replay") }) }),
  createInboundInventoryParser({ name: "mission-reward-item-purchase", logType: 7900, title: "Missions buy reward item", signature: ["credits_spent", "item", "quantity"], item: { kind: "scalar", field: "item", quantityField: "quantity" }, canonicalType: "non_cash_acquisition", basisPolicy: "unknown", consideration: { field: "credits_spent", resourceType: "mission_credits" } }),
  createInboundInventoryParser({ name: "wheel-item-reward", logType: 8377, title: "Casino spin the wheel win item", signature: ["item", "wheel"], item: { kind: "scalar", field: "item" }, canonicalType: "reward", basisPolicy: "unknown", attributes: (data) => ({ wheel: String(data.wheel) }) }),
  createInboundInventoryParser({ name: "christmas-town-find-item", logType: 8930, title: "Christmas town find item", signature: ["item"], item: { kind: "scalar", field: "item" }, canonicalType: "reward", basisPolicy: "zero_cash" }),
  createInboundInventoryParser({ name: "christmas-town-purchase-item", logType: 8934, title: "Christmas town purchase item", signature: ["bucks", "item", "quantity"], item: { kind: "scalar", field: "item", quantityField: "quantity" }, canonicalType: "non_cash_acquisition", basisPolicy: "unknown", consideration: { field: "bucks", resourceType: "christmas_bucks" } }),
  createInboundInventoryParser({ name: "christmas-town-items", logType: 8938, title: "Christmas town items", signature: ["items", "minigame"], item: { kind: "map", field: "items" }, canonicalType: "reward", basisPolicy: "unknown", attributes: (data) => ({ minigame: String(data.minigame) }) }),
  createInboundInventoryParser({ name: "easter-egg-pickup", logType: 8980, title: "Easter egg hunt pickup egg", signature: ["egg"], item: { kind: "scalar", field: "egg" }, canonicalType: "reward", basisPolicy: "zero_cash" }),
]);
