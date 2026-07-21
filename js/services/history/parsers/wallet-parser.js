import { createCanonicalEvent } from "../canonical-event.js";
import { dataFor, itemMovements, number, titleFor, typeFor } from "./torn-log-fields.js";

export const WalletParser = Object.freeze({
  name: "wallet",
  version: "1.0.0",
  matches: (log) => typeFor(log) === 2405 && /^item use wallet$/i.test(titleFor(log)),
  parse({ sourceLogId, rawLog }){
    const data = dataFor(rawLog);
    const movements = [...itemMovements("out", data.item, "input"), ...itemMovements("in", data.items, "output")];
    const cash = number(data.money);
    if (cash !== null) movements.push({ direction: "in", resourceType: "cash", amount: cash, unit: "dollar", role: "output", attributes: {} });
    return [createCanonicalEvent({ sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "conversion", parserName: "wallet", parserVersion: "1.0.0", movements, attributes: { mechanic: "wallet_open" }, sourceMetadata: { logType: typeFor(rawLog), title: titleFor(rawLog), category: rawLog.category ?? null } })];
  },
});
