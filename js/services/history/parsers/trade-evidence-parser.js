import { createCanonicalEvent, UnsupportedVariantError } from "../canonical-event.js";
import { dataFor, titleFor, typeFor } from "./torn-log-fields.js";

function exactData(log, fields, parserName){
  const data = dataFor(log);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new UnsupportedVariantError(`${parserName} has an unsupported payload structure.`);
  const actual = Object.keys(data).sort(); const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) throw new UnsupportedVariantError(`${parserName} has an unsupported payload signature.`);
  return data;
}
function positiveInteger(value, field){
  if (!Number.isInteger(value) || value <= 0) throw new UnsupportedVariantError(`${field} must be a positive integer.`);
  return value;
}
function participant(value, parserName){
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) throw new UnsupportedVariantError(`${parserName} has an invalid trade partner.`);
  return { role: "trade_partner", entityType: "player", entityId: String(value) };
}
function metadata(log){ return { logType: typeFor(log), title: titleFor(log), category: log.category ?? log.details?.category ?? null }; }
function itemMovements(value){
  if (!Array.isArray(value) || !value.length) throw new UnsupportedVariantError("trade-items-outgoing-evidence requires a non-empty item array.");
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new UnsupportedVariantError("trade-items-outgoing-evidence has an invalid item row.");
    const actual = Object.keys(row); if (actual.some((field) => !["id", "qty", "uid"].includes(field)) || !actual.includes("id") || !actual.includes("qty")) throw new UnsupportedVariantError("trade-items-outgoing-evidence has an unsupported item row signature.");
    const itemId = positiveInteger(row.id, "item ID"); const quantity = positiveInteger(row.qty, "item quantity");
    const uid = row.uid === null || row.uid === undefined || row.uid === 0 ? null : String(row.uid);
    if (uid && quantity !== 1) throw new UnsupportedVariantError("A UID-bearing trade item must have quantity one.");
    return { direction: "transfer", resourceType: "item", resourceId: String(itemId), quantity, unit: "item", role: "trade_evidence", attributes: uid ? { uid } : {} };
  });
}
function tradeEnvelope(log, data, parserName){
  return {
    eventTimestamp: Number(log.timestamp),
    counterparties: [participant(data.user, parserName)],
    attributes: { mechanic: parserName.replaceAll("-", "_"), tradeId: positiveInteger(data.parsed_trade_id, "parsed_trade_id"), opaqueTradeId: String(data.trade_id), correlationRequired: true },
    sourceMetadata: metadata(log),
  };
}
function createEvidenceParser({ name, logType, title, fields, movement }){
  return Object.freeze({
    name, version: "1.0.0", family: "Trade", coverageStatus: "partial",
    matches: (log) => typeFor(log) === logType && titleFor(log).toLocaleLowerCase() === title.toLocaleLowerCase(),
    parse({ sourceLogId, rawLog }){
      const data = exactData(rawLog, fields, name);
      const movements = movement ? movement(data) : [];
      return [createCanonicalEvent({
        sourceLogId, eventType: "activity", parserName: name, parserVersion: "1.0.0",
        movements, ...tradeEnvelope(rawLog, data, name),
      })];
    },
  });
}

export const TradeCompletedEvidenceParser = createEvidenceParser({
  name: "trade-completed-evidence", logType: 4430, title: "Trade completed",
  fields: ["parsed_trade_id", "trade_id", "user"],
});
export const TradeMoneyOutgoingEvidenceParser = createEvidenceParser({
  name: "trade-money-outgoing-evidence", logType: 4440, title: "Trade money outgoing",
  fields: ["money", "parsed_trade_id", "trade_id", "user"],
  movement: (data) => [{ direction: "transfer", resourceType: "cash", amount: positiveInteger(data.money, "money"), unit: "dollar", role: "trade_evidence", attributes: {} }],
});
export const TradeMoneyIncomingEvidenceParser = createEvidenceParser({
  name: "trade-money-incoming-evidence", logType: 4441, title: "Trade money incoming",
  fields: ["money", "parsed_trade_id", "trade_id", "user"],
  movement: (data) => [{ direction: "transfer", resourceType: "cash", amount: positiveInteger(data.money, "money"), unit: "dollar", role: "trade_evidence", attributes: {} }],
});
export const TradeItemsOutgoingEvidenceParser = createEvidenceParser({
  name: "trade-items-outgoing-evidence", logType: 4445, title: "Trade items outgoing",
  fields: ["items", "parsed_trade_id", "trade_id", "user"],
  movement: (data) => itemMovements(data.items),
});

export const TradeEvidenceParsers = Object.freeze([
  TradeCompletedEvidenceParser,
  TradeMoneyOutgoingEvidenceParser,
  TradeMoneyIncomingEvidenceParser,
  TradeItemsOutgoingEvidenceParser,
]);
