import { createCanonicalEvent, UnsupportedVariantError } from "../canonical-event.js";
import { dataFor, titleFor, typeFor } from "./torn-log-fields.js";
import { verifiedItemMovements } from "./item-conversion-parser.js";

function sourceMetadata(log){ return { logType: typeFor(log), title: titleFor(log), category: log.category ?? log.details?.category ?? null }; }
function exactDataFields(log, fields, parserName){
  const data = log?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new UnsupportedVariantError(`${parserName} has an unsupported payload structure.`);
  const actual = Object.keys(data).sort(); const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) throw new UnsupportedVariantError(`${parserName} has an unsupported payload signature.`);
}
function participant(role, value, parserName){
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) throw new UnsupportedVariantError(`${parserName} has an invalid ${role}.`);
  return { role, entityType: "player", entityId: String(value) };
}

/** Strict factory for verified player-to-player item movements; it never assigns economic meaning. */
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

export const LegacyItemReceiveTransferParser = createTransferParser({
  name: "legacy-item-receive-transfer", logType: 4101, title: "Item receive \\(legacy\\)", direction: "in",
  participantField: "sender", participantRole: "sender", itemField: "item", itemStructure: "scalar", scalarQuantityField: "quantity",
  signature: ["item", "message", "quantity", "sender"],
});
export const ItemSendTransferParser = createTransferParser({
  name: "item-send-transfer", logType: 4102, title: "Item send", direction: "out",
  participantField: "receiver", participantRole: "receiver", itemField: "items", itemStructure: "array",
  signature: ["items", "message", "receiver"],
});
export const ItemReceiveTransferParser = createTransferParser({
  name: "item-receive-transfer", logType: 4103, title: "Item receive", direction: "in",
  participantField: "sender", participantRole: "sender", itemField: "items", itemStructure: "map",
  signature: ["items", "message", "sender"],
});

export const TransferParsers = Object.freeze([LegacyItemReceiveTransferParser, ItemSendTransferParser, ItemReceiveTransferParser]);
