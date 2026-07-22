import { createCanonicalEvent, UnsupportedVariantError } from "../canonical-event.js";
import { dataFor, titleFor, typeFor } from "./torn-log-fields.js";

function finitePositiveInteger(value){ return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : null; }
function finiteNonnegative(value){ return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function sourceMetadata(log){ return { logType: typeFor(log), title: titleFor(log), category: log.category ?? log.details?.category ?? null }; }

/** Strictly decodes only scalar IDs, arrays of explicit item lines, and quantity object maps. */
export function verifiedItemMovements(direction, value, role, { scalarQuantity = null, maxItems = null } = {}){
  const lines = [];
  if (finitePositiveInteger(value) !== null) {
    const quantity = finitePositiveInteger(scalarQuantity);
    if (quantity === null) throw new UnsupportedVariantError("Scalar conversion item has no verified quantity.");
    lines.push({ itemId: value, quantity, uid: null });
  } else if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new UnsupportedVariantError("Conversion item array has an unsupported entry.");
      const itemId = finitePositiveInteger(entry.id ?? entry.item_id);
      const quantity = finitePositiveInteger(entry.qty ?? entry.quantity ?? entry.amount);
      if (itemId === null || quantity === null) throw new UnsupportedVariantError("Conversion item array has invalid item data.");
      const uid = entry.uid ?? null;
      if (uid !== null && typeof uid !== "number" && typeof uid !== "string") throw new UnsupportedVariantError("Conversion item array has invalid UID data.");
      lines.push({ itemId, quantity, uid });
    });
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([rawItemId, rawQuantity]) => {
      const itemId = finitePositiveInteger(Number(rawItemId)); const quantity = finitePositiveInteger(rawQuantity);
      if (itemId === null || quantity === null) throw new UnsupportedVariantError("Conversion item map has invalid item data.");
      lines.push({ itemId, quantity, uid: null });
    });
  } else {
    throw new UnsupportedVariantError("Conversion item structure is unsupported.");
  }
  if (!lines.length || (maxItems !== null && lines.length > maxItems)) throw new UnsupportedVariantError("Conversion has an unsupported number of item outputs.");
  const seen = new Set();
  lines.forEach(({ itemId }) => { if (seen.has(itemId)) throw new UnsupportedVariantError("Conversion contains duplicate item outputs."); seen.add(itemId); });
  return lines.map(({ itemId, quantity, uid }) => ({ direction, resourceType: "item", resourceId: String(itemId), quantity, unit: "item", role, attributes: uid === null ? {} : { uid: String(uid) } }));
}

/** Factory for verified input-item to item/cash-output transformations. */
export function createItemConversionParser({ name, version = "1.0.0", logType, title, inputField, outputItemField = null, outputCashField = null, maxItemOutputs = null, declaredOutputQuantityField = null }){
  return Object.freeze({
    name, version, family: "Conversion", coverageStatus: "partial",
    matches: (log) => typeFor(log) === logType && new RegExp(`^${title}$`, "i").test(titleFor(log)),
    parse({ sourceLogId, rawLog }){
      const data = dataFor(rawLog);
      const inputs = verifiedItemMovements("out", data[inputField], "input", { scalarQuantity: 1, maxItems: 1 });
      const itemOutputs = outputItemField ? verifiedItemMovements("in", data[outputItemField], "output", { maxItems: maxItemOutputs }) : [];
      if (declaredOutputQuantityField) {
        const declaredQuantity = finitePositiveInteger(data[declaredOutputQuantityField]);
        const outputQuantity = itemOutputs.reduce((sum, movement) => sum + movement.quantity, 0);
        if (declaredQuantity === null || declaredQuantity !== outputQuantity) throw new UnsupportedVariantError(`${name} has inconsistent output quantity.`);
      }
      const cash = outputCashField ? finiteNonnegative(data[outputCashField]) : null;
      if (outputCashField && cash === null) throw new UnsupportedVariantError(`${name} has invalid cash output.`);
      if (!itemOutputs.length && cash === null) throw new UnsupportedVariantError(`${name} has no supported outputs.`);
      const movements = [...inputs, ...itemOutputs];
      if (cash !== null) movements.push({ direction: "in", resourceType: "cash", amount: cash, unit: "dollar", role: "output", attributes: {} });
      return [createCanonicalEvent({ sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "conversion", parserName: name, parserVersion: version, movements, attributes: { mechanic: name }, sourceMetadata: sourceMetadata(rawLog) })];
    },
  });
}
