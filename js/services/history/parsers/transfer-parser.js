import { createCanonicalEvent, UnsupportedVariantError } from "../canonical-event.js";
import { dataFor, titleFor, typeFor } from "./torn-log-fields.js";
import { verifiedItemMovements } from "./item-conversion-parser.js";

function sourceMetadata(log){ return { logType: typeFor(log), title: titleFor(log), category: log.category ?? log.details?.category ?? null }; }
function exactDataFields(log, fields, parserName, optionalFields = []){
  const data = log?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new UnsupportedVariantError(`${parserName} has an unsupported payload structure.`);
  const actual = Object.keys(data);
  const allowed = new Set([...fields, ...optionalFields]);
  if (fields.some((field) => !actual.includes(field)) || actual.some((field) => !allowed.has(field))) throw new UnsupportedVariantError(`${parserName} has an unsupported payload signature.`);
}
function participant(role, value, parserName){
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) throw new UnsupportedVariantError(`${parserName} has an invalid ${role}.`);
  return { role, entityType: "player", entityId: String(value) };
}
function normalizedUid(value, parserName){
  if (value === undefined || value === null || value === 0) return null;
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) throw new UnsupportedVariantError(`${parserName} has an invalid item UID.`);
  return String(value);
}
function giftMovements(data, { name, itemField, itemStructure, scalarQuantityField, scalarUidField }){
  if (itemStructure === "scalar") {
    const movements = verifiedItemMovements("in", data[itemField], "gift", { scalarQuantity: data[scalarQuantityField] });
    const uid = normalizedUid(data[scalarUidField], name);
    if (uid !== null) {
      if (movements[0].quantity !== 1) throw new UnsupportedVariantError(`${name} cannot assign one UID to multiple items.`);
      movements[0] = { ...movements[0], attributes: { uid } };
    }
    return movements;
  }
  const value = data[itemField];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UnsupportedVariantError(`${name} has an unsupported item structure.`);
  const entries = Object.entries(value);
  if (!entries.length) throw new UnsupportedVariantError(`${name} contains no gift items.`);
  return entries.map(([itemId, entry]) => {
    if (typeof entry === "number") return verifiedItemMovements("in", { [itemId]: entry }, "gift")[0];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new UnsupportedVariantError(`${name} has an unsupported gift item row.`);
    const fields = Object.keys(entry); const quantityFields = fields.filter((field) => field === "qty" || field === "quantity");
    if (quantityFields.length !== 1 || fields.some((field) => !["qty", "quantity", "uid"].includes(field))) throw new UnsupportedVariantError(`${name} has an unsupported gift item row signature.`);
    const movement = verifiedItemMovements("in", [{ id: Number(itemId), qty: entry[quantityFields[0]], uid: normalizedUid(entry.uid, name) }], "gift")[0];
    if (movement.attributes.uid && movement.quantity !== 1) throw new UnsupportedVariantError(`${name} cannot assign one UID to multiple items.`);
    return movement;
  });
}

/** Strict factory for verified player-to-player item movements that remain accounting-neutral. */
export function createTransferParser({ name, version = "1.0.0", logType, title, direction, participantField, participantRole, itemField, itemStructure, scalarQuantityField = null, signature }){
  return Object.freeze({
    name, version, family: "Transfer",
    matches: (log) => typeFor(log) === logType && new RegExp(`^${title}$`, "i").test(titleFor(log)),
    parse({ sourceLogId, rawLog }){
      exactDataFields(rawLog, signature, name);
      const data = dataFor(rawLog);
      const value = data[itemField];
      if (itemStructure === "array" && !Array.isArray(value)) throw new UnsupportedVariantError(`${name} has an unsupported item structure.`);
      if (itemStructure === "map" && (!value || typeof value !== "object" || Array.isArray(value))) throw new UnsupportedVariantError(`${name} has an unsupported item structure.`);
      const scalarQuantity = scalarQuantityField ? data[scalarQuantityField] : null;
      const movements = verifiedItemMovements(direction, value, "transfer", { scalarQuantity });
      const counterparties = [participant(participantRole, data[participantField], name)];
      return [createCanonicalEvent({
        sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "transfer", parserName: name, parserVersion: version,
        counterparties, movements,
        attributes: { mechanic: "item_transfer", direction, participantRole },
        sourceMetadata: sourceMetadata(rawLog),
      })];
    },
  });
}

/** Strict gift-receipt factory. Confirmed receipts create zero-cash reward supply. */
export function createGiftReceivedParser({ name, supersedesParserName, logType, title, itemField, itemStructure, scalarQuantityField = null, scalarUidField = null, signature }){
  return Object.freeze({
    name, version: "1.0.0", family: "Reward", supersedesParserNames: [supersedesParserName],
    matches: (log) => typeFor(log) === logType && new RegExp(`^${title}$`, "i").test(titleFor(log)),
    parse({ sourceLogId, rawLog }){
      exactDataFields(rawLog, signature, name, scalarUidField ? [scalarUidField] : []);
      const data = dataFor(rawLog);
      const movements = giftMovements(data, { name, itemField, itemStructure, scalarQuantityField, scalarUidField });
      const counterparties = [participant("sender", data.sender, name)];
      return [createCanonicalEvent({
        sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "gift_received", parserName: name, parserVersion: "1.0.0",
        counterparties, movements,
        attributes: { mechanic: "gift_received", basisPolicy: "zero_cash" },
        sourceMetadata: sourceMetadata(rawLog),
      })];
    },
  });
}

export const LegacyItemReceiveGiftParser = createGiftReceivedParser({
  name: "legacy-item-receive-gift", supersedesParserName: "legacy-item-receive-transfer",
  logType: 4101, title: "Item receive \\(legacy\\)", itemField: "item", itemStructure: "scalar", scalarQuantityField: "quantity", scalarUidField: "uid",
  signature: ["item", "message", "quantity", "sender"],
});
export const ItemSendTransferParser = createTransferParser({
  name: "item-send-transfer", logType: 4102, title: "Item send", direction: "out",
  participantField: "receiver", participantRole: "receiver", itemField: "items", itemStructure: "array",
  signature: ["items", "message", "receiver"],
});
export const ItemReceiveGiftParser = createGiftReceivedParser({
  name: "item-receive-gift", supersedesParserName: "item-receive-transfer",
  logType: 4103, title: "Item receive", itemField: "items", itemStructure: "map",
  signature: ["items", "message", "sender"],
});

export const TransferParsers = Object.freeze([LegacyItemReceiveGiftParser, ItemSendTransferParser, ItemReceiveGiftParser]);
