import { createCanonicalEvent } from "../canonical-event.js";
import { dataFor, itemMovements, titleFor, typeFor } from "./torn-log-fields.js";

export const BloodBagParser = Object.freeze({
  name: "blood-bag",
  version: "1.0.0",
  family: "Conversion",
  matches: (log) => typeFor(log) === 2340 && /^item use empty blood bag$/i.test(titleFor(log)),
  parse({ sourceLogId, rawLog }){
    const data = dataFor(rawLog);
    return [createCanonicalEvent({ sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "conversion", parserName: "blood-bag", parserVersion: "1.0.0", movements: [...itemMovements("out", data.item, "input"), ...itemMovements("in", data.blood_bag, "output")], attributes: { mechanic: "blood_bag_fill" }, sourceMetadata: { logType: typeFor(rawLog), title: titleFor(rawLog), category: rawLog.category ?? null } })];
  },
});
