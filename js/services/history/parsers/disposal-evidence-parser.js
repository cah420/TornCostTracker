import { createCanonicalEvent, UnsupportedVariantError } from "../canonical-event.js";
import { dataFor, titleFor, typeFor } from "./torn-log-fields.js";
import { createItemConversionParser, verifiedItemMovements } from "./item-conversion-parser.js";

function exactData(log, fields, parserName){
  const data = dataFor(log);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new UnsupportedVariantError(`${parserName} has an unsupported payload structure.`);
  const actual = Object.keys(data).sort(); const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) throw new UnsupportedVariantError(`${parserName} has an unsupported payload signature.`);
  return data;
}
function metadata(log){ return { logType: typeFor(log), title: titleFor(log), category: log.category ?? log.details?.category ?? null }; }
function participant(role, entityType, value){
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) throw new UnsupportedVariantError(`${role} is invalid.`);
  return { role, entityType, entityId: String(value) };
}
function itemOut(value, { quantity = 1, role = "disposed", maxItems = null } = {}){
  return verifiedItemMovements("out", value, role, { scalarQuantity: quantity, maxItems });
}

export function createVerifiedNonCashDisposalParser({ name, logType, title, signature, itemField, itemShape = "scalar", disposalType, reason = null, counterparty = null }){
  return Object.freeze({
    name, version: "1.0.0", family: "Disposal", coverageStatus: "partial",
    matches: (log) => typeFor(log) === logType && titleFor(log).toLocaleLowerCase() === title.toLocaleLowerCase(),
    parse({ sourceLogId, rawLog }){
      const data = exactData(rawLog, signature, name);
      const value = data[itemField];
      if (itemShape === "array" && !Array.isArray(value)) throw new UnsupportedVariantError(`${name} requires an item array.`);
      if (itemShape === "map" && (!value || typeof value !== "object" || Array.isArray(value))) throw new UnsupportedVariantError(`${name} requires an item quantity map.`);
      const movements = itemShape === "map" ? itemOut(value) : itemShape === "array" ? itemOut(value) : itemOut(value, { quantity: 1, maxItems: 1 });
      if (movements.some((movement) => movement.attributes?.uid && movement.quantity !== 1)) throw new UnsupportedVariantError(`${name} cannot assign one UID to multiple units.`);
      const counterparties = counterparty ? [participant(counterparty.role, counterparty.entityType, data[counterparty.field])] : [];
      return [createCanonicalEvent({
        sourceLogId,
        eventTimestamp: Number(rawLog.timestamp),
        eventType: "non_cash_disposal",
        parserName: name,
        parserVersion: "1.0.0",
        counterparties,
        movements,
        attributes: { mechanic: name, disposalType, proceedsStatus: "known_zero", reason: reason ?? title },
        sourceMetadata: metadata(rawLog),
      })];
    },
  });
}

function reviewOnly({ name, logType, title, signature, classification, reason }){
  return Object.freeze({
    name, version: "1.0.0", family: "Review Required", coverageStatus: "partial",
    matches: (log) => typeFor(log) === logType && titleFor(log).toLocaleLowerCase() === title.toLocaleLowerCase(),
    parse({ sourceLogId, rawLog }){
      exactData(rawLog, signature, name);
      return [createCanonicalEvent({
        sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "activity", parserName: name, parserVersion: "1.0.0",
        movements: [], attributes: { mechanic: name, classification, reviewRequired: true, reason }, sourceMetadata: metadata(rawLog),
      })];
    },
  });
}

const consumptionContracts = [
  [2010, "Item use entertainment", ["energy_decreased", "faction", "happy_increased", "item"], "item"],
  [2020, "Item use candy", ["faction", "happy_increased", "item"], "item"],
  [2030, "Item use alcohol", ["faction", "item", "nerve_increased"], "item"],
  [2050, "Item use book", ["faction", "item"], "item"],
  [2060, "Item use morphine", ["faction", "hospital_time_decreased", "item", "life_increased"], "item"],
  [2070, "Item use first aid kit", ["faction", "hospital_time_decreased", "item", "life_increased"], "item"],
  [2080, "Item use small first aid kit", ["faction", "hospital_time_decreased", "item", "life_increased"], "item"],
  [2090, "Item use neumune tablet", ["faction", "hospital_time_decreased", "item", "life_increased"], "item"],
  [2100, "Item use blood bag", ["faction", "hospital_time_decreased", "item", "life_increased"], "item"],
  [2101, "Item use blood bag wrong type", ["faction", "hospital_time_increased", "item"], "item"],
  [2102, "Item use blood bag irradiated", ["faction", "hospital_time_increased", "item", "radiation_increased"], "item"],
  [2105, "Item use ipecac syrup", ["faction", "hospital_time_increased", "item"], "item"],
  [2110, "Item use lawyer business card", ["faction", "item", "jail_time_decreased"], "item"],
  [2180, "Item use erotic dvd", ["faction", "happy_increased", "item"], "item"],
  [2200, "Item use cannabis", ["faction", "item", "nerve_increased"], "item"],
  [2210, "Item use ecstasy", ["faction", "happy_increased", "item"], "item"],
  [2211, "Item use ecstasy overdose", ["energy_decreased", "faction", "happy_decreased", "item"], "item"],
  [2230, "Item use LSD", ["energy_increased", "faction", "happy_increased", "item", "nerve_increased"], "item"],
  [2231, "Item use LSD overdose", ["energy_decreased", "faction", "happy_decreased", "item", "nerve_decreased"], "item"],
  [2240, "Item use opium", ["faction", "hospital_time_decreased", "item", "life_increased"], "item"],
  [2280, "Item use vicodin", ["faction", "happy_increased", "item"], "item"],
  [2281, "Item use vicodin overdose", ["faction", "happy_decreased", "item"], "item"],
  [2290, "Item use xanax", ["faction", "item"], "item"],
  [2291, "Item use xanax overdose", ["energy_decreased", "faction", "happy_decreased", "hospital_time_increased", "item", "nerve_decreased"], "item"],
  [2300, "Item use dog poop success", ["faction", "item", "target"], "item"],
  [2310, "Item use stink bombs success", ["faction", "item", "target"], "item"],
  [2320, "Item use toilet paper success", ["faction", "item", "target"], "item"],
  [2410, "Item use box of tissues", ["faction", "happy_increased", "item"], "item"],
  [2420, "Item use vanity mirror", ["faction", "happy_decreased", "item"], "item"],
  [2450, "Item use cake frosting / lock picking kit", ["faction", "item"], "item"],
  [2460, "Item use felovax", ["faction", "hospital_time_increased", "item", "jail_time_decreased"], "item"],
  [2470, "Item use zylkene", ["faction", "hospital_time_decreased", "item"], "item"],
  [8981, "Item use green easter egg", ["egg", "energy_increased"], "egg"],
  [8982, "Item use red easter egg", ["egg", "nerve_increased"], "egg"],
  [8983, "Item use yellow easter egg", ["egg", "happy_increased"], "egg"],
];

export const ConsumptionDisposalParsers = Object.freeze(consumptionContracts.map(([logType, title, signature, itemField]) =>
  createVerifiedNonCashDisposalParser({ name: `consumption-${logType}`, logType, title, signature, itemField, disposalType: "consumption" })
));

export const DumpAddDisposalParser = createVerifiedNonCashDisposalParser({
  name: "dump-add-disposal", logType: 1403, title: "Dump add", signature: ["items"], itemField: "items", itemShape: "array", disposalType: "loss_or_destruction", reason: "discarded_to_dump",
});
export const ItemSendGiftParser = Object.freeze({
  ...createVerifiedNonCashDisposalParser({
    name: "item-send-gift", logType: 4102, title: "Item send", signature: ["items", "message", "receiver"], itemField: "items", itemShape: "array", disposalType: "gift_or_donation",
    counterparty: { field: "receiver", role: "recipient", entityType: "player" },
  }),
  supersedesParserNames: ["item-send-transfer"],
});
export const FactionDepositDonationParser = createVerifiedNonCashDisposalParser({
  name: "faction-deposit-donation", logType: 6728, title: "Faction deposit item", signature: ["faction", "items"], itemField: "items", itemShape: "array", disposalType: "gift_or_donation",
  counterparty: { field: "faction", role: "destination", entityType: "faction" },
});
export const ChristmasPotDonationParser = createVerifiedNonCashDisposalParser({
  name: "christmas-pot-donation", logType: 8936, title: "Christmas town pot deposit item", signature: ["item"], itemField: "item", disposalType: "gift_or_donation", reason: "christmas_town_pot_deposit",
});
export const CrimeItemLossParser = createVerifiedNonCashDisposalParser({
  name: "crime-critical-item-loss", logType: 9163, title: "Crime critical fail item loss", signature: ["crime_action", "items_lost", "nerve", "outcome"], itemField: "items_lost", itemShape: "map", disposalType: "loss_or_destruction", reason: "crime_critical_failure",
});

export const DukesSafeConversionParser = Object.freeze({
  name: "dukes-safe-conversion", version: "1.0.0", family: "Conversion", coverageStatus: "partial",
  matches: (log) => typeFor(log) === 2480 && titleFor(log).toLocaleLowerCase() === "item use dukes safe",
  parse({ sourceLogId, rawLog }){
    const data = exactData(rawLog, ["faction", "item", "item2"], "dukes-safe-conversion");
    return [createCanonicalEvent({
      sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "conversion", parserName: "dukes-safe-conversion", parserVersion: "1.0.0",
      movements: [...verifiedItemMovements("out", data.item, "input", { scalarQuantity: 1, maxItems: 1 }), ...verifiedItemMovements("in", data.item2, "output", { scalarQuantity: 1, maxItems: 1 })],
      attributes: { mechanic: "dukes_safe_conversion" }, sourceMetadata: metadata(rawLog),
    })];
  },
});

export const CrimeSkimmingConversionInputParser = Object.freeze({
  name: "crime-skimming-conversion-input", version: "1.0.0", family: "Conversion", coverageStatus: "partial",
  matches: (log) => typeFor(log) === 9302 && titleFor(log).toLocaleLowerCase() === "crime use items for skimming",
  parse({ sourceLogId, rawLog }){
    const data = exactData(rawLog, ["first_item", "second_item"], "crime-skimming-conversion-input");
    return [createCanonicalEvent({
      sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "conversion_input", parserName: "crime-skimming-conversion-input", parserVersion: "1.0.0",
      movements: [...verifiedItemMovements("out", data.first_item, "conversion_input", { scalarQuantity: 1, maxItems: 1 }), ...verifiedItemMovements("out", data.second_item, "conversion_input", { scalarQuantity: 1, maxItems: 1 })],
      attributes: { mechanic: "crime_skimming", awaitingConversionAccounting: true }, sourceMetadata: metadata(rawLog),
    })];
  },
});
export const BlackEasterEggConversionParser = createItemConversionParser({
  name: "black-easter-egg-conversion", logType: 8985, title: "Item use black easter egg", inputField: "egg", outputCashField: "money_increased",
});

export const ReviewOnlyDisposalParsers = Object.freeze([
  reviewOnly({ name: "museum-exchange-review", logType: 7000, title: "Museum exchange", signature: ["points_received", "quantity", "set"], classification: "conversion_input", reason: "set name does not prove component Item IDs" }),
  reviewOnly({ name: "crime-blank-dvds-review", logType: 9300, title: "Crime item add blank DVDs", signature: ["items_added"], classification: "conversion_input", reason: "payload contains quantity but no canonical Item ID" }),
  reviewOnly({ name: "crime-spray-can-review", logType: 9301, title: "Crime item add spray can", signature: ["items_added"], classification: "conversion_input", reason: "payload contains quantity but no canonical Item ID" }),
  reviewOnly({ name: "faction-give-item-send-review", logType: 6732, title: "Faction give item send", signature: ["faction", "items", "receiver"], classification: "transfer", reason: "evidence describes faction-owned inventory rather than a personal inventory outflow" }),
]);

export const DisposalEvidenceParsers = Object.freeze([
  ...ConsumptionDisposalParsers,
  DumpAddDisposalParser,
  ItemSendGiftParser,
  FactionDepositDonationParser,
  ChristmasPotDonationParser,
  CrimeItemLossParser,
  DukesSafeConversionParser,
  BlackEasterEggConversionParser,
  CrimeSkimmingConversionInputParser,
  ...ReviewOnlyDisposalParsers,
]);
