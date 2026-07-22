import { createCanonicalEvent, UnsupportedVariantError } from "../canonical-event.js";
import { dataFor, titleFor, typeFor } from "./torn-log-fields.js";
import { verifiedItemMovements } from "./item-conversion-parser.js";

function finiteNonnegative(value){ return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function finitePositiveInteger(value){ return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : null; }
function sourceMetadata(log){ return { logType: typeFor(log), title: titleFor(log), category: log.category ?? log.details?.category ?? null }; }
function participant(role, entityType, entityId){
  if ((typeof entityId !== "string" && typeof entityId !== "number") || !String(entityId).trim()) throw new UnsupportedVariantError("Cash sale has invalid buyer data.");
  return { role, entityType, entityId: String(entityId) };
}

/** Strict, configured disposal parser for verified item-out/cash-in source contracts. */
export function createCashSaleParser({ name, version = "1.0.0", logType, title, market, itemField, quantityField = null, totalField, unitField = null, nullableUnitField = false, buyerField = "buyer", maxItems = 1, requiredTotalQuantity = null, sourceFields = [], requiredLiterals = {} }){
  return Object.freeze({
    name, version, family: "Disposal", coverageStatus: "partial",
    matches: (log) => typeFor(log) === logType && new RegExp(`^${title}$`, "i").test(titleFor(log)),
    parse({ sourceLogId, rawLog }){
      const data = dataFor(rawLog);
      Object.entries(requiredLiterals).forEach(([field, value]) => {
        if (data[field] !== value) throw new UnsupportedVariantError(`${name} has unsupported ${field} metadata.`);
      });
      const scalarQuantity = quantityField ? finitePositiveInteger(data[quantityField]) : null;
      if (quantityField && scalarQuantity === null) throw new UnsupportedVariantError(`${name} has invalid item quantity.`);
      const items = verifiedItemMovements("out", data[itemField], "sold", { scalarQuantity, maxItems });
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      if (requiredTotalQuantity !== null && totalQuantity !== requiredTotalQuantity) throw new UnsupportedVariantError(`${name} has unsupported item quantity.`);
      const total = finiteNonnegative(data[totalField]);
      if (total === null) throw new UnsupportedVariantError(`${name} has invalid total proceeds.`);
      const unit = unitField ? (data[unitField] === null && nullableUnitField ? null : finiteNonnegative(data[unitField])) : null;
      if (unitField && unit === null && !nullableUnitField) throw new UnsupportedVariantError(`${name} has invalid unit proceeds.`);
      if (unit !== null && Math.abs((unit * totalQuantity) - total) > 0.01) throw new UnsupportedVariantError(`${name} has inconsistent unit and total proceeds.`);
      const sourceAttributes = Object.fromEntries(sourceFields.filter((field) => Object.hasOwn(data, field)).map((field) => [field, data[field]]));
      const counterparties = [market, ...(buyerField ? [participant("buyer", "player", data[buyerField])] : [])];
      const movements = [...items, { direction: "in", resourceType: "cash", amount: total, unit: "dollar", role: "proceeds", attributes: {} }];
      return [createCanonicalEvent({ sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "disposal", parserName: name, parserVersion: version, counterparties, movements, attributes: { mechanic: name, unitPrice: unit, totalProceeds: total, sourceAttributes }, sourceMetadata: sourceMetadata(rawLog) })];
    },
  });
}
