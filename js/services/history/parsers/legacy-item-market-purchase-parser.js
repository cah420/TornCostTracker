import { createCanonicalEvent, UnsupportedVariantError } from "../canonical-event.js";
import { dataFor, titleFor, typeFor } from "./torn-log-fields.js";
import { verifiedItemMovements } from "./item-conversion-parser.js";

const VERIFIED_SIGNATURE = Object.freeze(["cost", "item", "seller"]);

function sourceMetadata(log){ return { logType: typeFor(log), title: titleFor(log), category: log.category ?? log.details?.category ?? null }; }
function exactDataSignature(log){
  const data = log?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new UnsupportedVariantError("Legacy Item Market purchase has an unsupported payload structure.");
  const fields = Object.keys(data).sort();
  if (fields.length !== VERIFIED_SIGNATURE.length || fields.some((field, index) => field !== VERIFIED_SIGNATURE[index])) throw new UnsupportedVariantError("Legacy Item Market purchase has an unsupported payload signature.");
}
function seller(value){
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) throw new UnsupportedVariantError("Legacy Item Market purchase has an invalid seller.");
  return { role: "seller", entityType: "player", entityId: String(value) };
}
function totalCost(value){
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new UnsupportedVariantError("Legacy Item Market purchase has an invalid total consideration.");
  return value;
}

/**
 * Strict 1103 contract: one explicit item row with quantity one. In that shape
 * the recorded cost is both the transaction total and the unit cost, without
 * requiring a multi-line or multi-unit allocation assumption.
 */
export const LegacyItemMarketPurchaseParser = Object.freeze({
  name: "legacy-item-market-purchase",
  version: "1.0.0",
  family: "Acquisition",
  matches: (log) => typeFor(log) === 1103 && /^item market buy \(old\)$/i.test(titleFor(log)),
  parse({ sourceLogId, rawLog }){
    exactDataSignature(rawLog);
    const data = dataFor(rawLog);
    if (!Array.isArray(data.item) || !data.item.length) throw new UnsupportedVariantError("Legacy Item Market purchase has an unsupported item structure.");
    const items = verifiedItemMovements("in", data.item, "purchased", { maxItems: 1 });
    if (items.length !== 1) throw new UnsupportedVariantError("Legacy Item Market purchase has an unsupported item count.");
    if (items[0].quantity !== 1) throw new UnsupportedVariantError("Legacy Item Market purchase has an ambiguous item quantity.");
    const cost = totalCost(data.cost);
    return [createCanonicalEvent({
      sourceLogId,
      eventTimestamp: Number(rawLog.timestamp),
      eventType: "acquisition",
      parserName: "legacy-item-market-purchase",
      parserVersion: "1.0.0",
      counterparties: [seller(data.seller)],
      movements: [...items, { direction: "out", resourceType: "cash", amount: cost, unit: "dollar", role: "payment", attributes: {} }],
      attributes: { mechanic: "legacy_item_market_purchase", totalCost: cost, unitCost: cost, costInterpretation: "single_item_transaction_total" },
      sourceMetadata: sourceMetadata(rawLog),
    })];
  },
});

export const LEGACY_ITEM_MARKET_PURCHASE_SIGNATURE = VERIFIED_SIGNATURE;
