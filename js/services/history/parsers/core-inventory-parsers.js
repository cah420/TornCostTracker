import { createCanonicalEvent, UnsupportedVariantError } from "../canonical-event.js";
import { dataFor, itemMovements, number, titleFor, typeFor } from "./torn-log-fields.js";
import { createItemConversionParser } from "./item-conversion-parser.js";
import { createCashSaleParser } from "./cash-sale-parser.js";
import { TransferParsers } from "./transfer-parser.js";
import { LegacyItemMarketPurchaseParser } from "./legacy-item-market-purchase-parser.js";

function metadata(log){ return { logType: typeFor(log), title: titleFor(log), category: log.category ?? log.details?.category ?? null }; }
function participant(role, entityType, entityId = null){ return entityId === null || entityId === undefined ? { role, entityType } : { role, entityType, entityId: String(entityId) }; }
function verifiedNumber(value){ return typeof value === "number" && Number.isFinite(value) ? value : null; }
function purchase({ name, version, logType, title, market, itemValue = "items", quantityValue = null, sellerValue = "seller", strictScalarPurchase = false, locationField = null }){
  return Object.freeze({
    name, version, family: "Acquisition", ...(strictScalarPurchase ? { coverageStatus: "partial" } : {}),
    matches: (log) => typeFor(log) === logType && new RegExp(`^${title}$`, "i").test(titleFor(log)),
    parse({ sourceLogId, rawLog }){
      const data = dataFor(rawLog); const parsedQuantity = quantityValue ? (strictScalarPurchase ? verifiedNumber(data[quantityValue]) : number(data[quantityValue])) : null;
      const parsedItem = strictScalarPurchase ? verifiedNumber(data[itemValue]) : null;
      if (strictScalarPurchase && (parsedItem === null || parsedItem <= 0 || parsedQuantity === null || parsedQuantity <= 0)) {
        throw new UnsupportedVariantError(`${name} has an invalid scalar item or quantity.`);
      }
      const quantity = quantityValue ? (strictScalarPurchase ? parsedQuantity : parsedQuantity ?? 1) : 1;
      const items = itemMovements("in", data[itemValue], "purchased", quantity);
      if (!items.length) throw new UnsupportedVariantError(`${name} has no supported item lines.`);
      const costEach = strictScalarPurchase ? verifiedNumber(data.cost_each) : number(data.cost_each);
      const total = strictScalarPurchase ? verifiedNumber(data.cost_total) : number(data.cost_total);
      if (strictScalarPurchase && (costEach === null || costEach < 0 || total === null || total < 0)) {
        throw new UnsupportedVariantError(`${name} has invalid purchase consideration.`);
      }
      if (strictScalarPurchase && Math.abs((costEach * quantity) - total) > 0.01) {
        throw new UnsupportedVariantError(`${name} has inconsistent unit and total consideration.`);
      }
      const location = locationField ? (strictScalarPurchase ? verifiedNumber(data[locationField]) : number(data[locationField])) : null;
      if (strictScalarPurchase && locationField && (location === null || location < 0)) {
        throw new UnsupportedVariantError(`${name} has invalid location metadata.`);
      }
      const movements = [...items];
      if (total !== null) movements.push({ direction: "out", resourceType: "cash", amount: total, unit: "dollar", role: "payment", attributes: {} });
      const counterparties = [market, ...(sellerValue && data[sellerValue] !== undefined ? [participant("seller", "player", data[sellerValue])] : [])];
      const attributes = { mechanic: name, costEach, costTotal: total, ...(locationField ? { location: { [locationField]: location } } : {}) };
      return [createCanonicalEvent({ sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "acquisition", parserName: name, parserVersion: version, counterparties, movements, attributes, sourceMetadata: metadata(rawLog) })];
    },
  });
}

export const CityShopPurchaseParser = purchase({ name: "city-shop-purchase", version: "1.0.0", logType: 4200, title: "Item shop buy", market: participant("seller", "city_shop"), itemValue: "item", quantityValue: "quantity" });
export const BazaarPurchaseParser = purchase({ name: "bazaar-purchase", version: "1.0.0", logType: 1225, title: "Bazaar buy", market: participant("market", "bazaar") });
export const ItemMarketPurchaseParser = purchase({ name: "item-market-purchase", version: "1.0.0", logType: 1112, title: "Item market buy", market: participant("market", "item_market") });
export const LegacyBazaarPurchaseParser = purchase({ name: "legacy-bazaar-purchase", version: "1.0.0", logType: 1220, title: "Bazaar buy \\(legacy\\)", market: participant("market", "bazaar"), itemValue: "item", quantityValue: "quantity", strictScalarPurchase: true });
export const AbroadPurchaseParser = purchase({ name: "abroad-purchase", version: "1.0.0", logType: 4201, title: "Item abroad buy", market: participant("seller", "abroad_shop"), itemValue: "item", quantityValue: "quantity", sellerValue: null, strictScalarPurchase: true, locationField: "area" });
export const GrenadeBoxConversionParser = createItemConversionParser({ name: "grenade-box-conversion", logType: 2350, title: "Item use box of grenades", inputField: "item", outputItemField: "item2", maxItemOutputs: 1, declaredOutputQuantityField: "quantity" });
export const MedicalBoxConversionParser = createItemConversionParser({ name: "medical-box-conversion", logType: 2360, title: "Item use box of medical supplies", inputField: "item", outputItemField: "item2", maxItemOutputs: 1, declaredOutputQuantityField: "quantity" });
export const StashBoxConversionParser = createItemConversionParser({ name: "stash-box-conversion", logType: 2407, title: "Item use stash box", inputField: "item", outputCashField: "money" });
export const LegacyItemMarketSaleParser = createCashSaleParser({ name: "legacy-item-market-sale", logType: 1104, title: "Item market sell \\(old\\)", market: participant("market", "item_market"), itemField: "item", totalField: "cost", buyerField: "buyer", maxItems: 1, requiredTotalQuantity: 1 });
export const ItemMarketSaleParser = createCashSaleParser({ name: "item-market-sale", logType: 1113, title: "Item market sell", market: participant("market", "item_market"), itemField: "items", totalField: "cost_total", unitField: "cost_each", nullableUnitField: true, buyerField: "buyer", maxItems: 1, sourceFields: ["anonymous", "fee"] });
export const LegacyBazaarSaleParser = createCashSaleParser({ name: "legacy-bazaar-sale", logType: 1221, title: "Bazaar sell \\(legacy\\)", market: participant("market", "bazaar"), itemField: "item", quantityField: "quantity", totalField: "cost_total", unitField: "cost_each", buyerField: "buyer" });
export const BazaarSaleParser = createCashSaleParser({ name: "bazaar-sale", logType: 1226, title: "Bazaar sell", market: participant("market", "bazaar"), itemField: "items", totalField: "cost_total", unitField: "cost_each", buyerField: "buyer", maxItems: 1 });
export const CityShopSaleParser = createCashSaleParser({ name: "city-shop-sale", logType: 4210, title: "Item shop sell", market: participant("market", "city_shop"), itemField: "item", quantityField: "quantity", totalField: "total_value", unitField: "value_each", buyerField: null, sourceFields: ["area"], requiredLiterals: { area: null } });

export const TradeParser = Object.freeze({
  name: "trade", version: "1.0.0", family: "Trade", coverageStatus: "partial",
  matches: (log) => [4401, 4420, 4482].includes(typeFor(log)),
  parse({ sourceLogId, rawLog }){
    const data = dataFor(rawLog); const type = typeFor(rawLog); const partner = data.user === undefined ? [] : [participant("trade_partner", "player", data.user)];
    if (type === 4482) {
      const movements = itemMovements("transfer", data.items, "counterparty_offer");
      if (!movements.length) throw new UnsupportedVariantError("Trade offer has no supported item lines.");
      return [createCanonicalEvent({ sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "transfer", parserName: "trade", parserVersion: "1.0.0", counterparties: partner, movements, attributes: { mechanic: "trade_offer", tradeId: data.parsed_trade_id ?? null, state: "offered" }, sourceMetadata: metadata(rawLog) })];
    }
    return [createCanonicalEvent({ sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "activity", parserName: "trade", parserVersion: "1.0.0", counterparties: partner, movements: [], attributes: { mechanic: type === 4401 ? "trade_initiated" : "trade_expired", tradeId: data.parsed_trade_id ?? null }, sourceMetadata: metadata(rawLog) })];
  },
});

function reward({ name, logType, title, itemField = null, cashField = null, source }){
  return Object.freeze({ name, version: "1.0.0", family: "Reward", matches: (log) => typeFor(log) === logType && new RegExp(`^${title}$`, "i").test(titleFor(log)), parse({ sourceLogId, rawLog }) {
    const data = dataFor(rawLog); const movements = itemField ? itemMovements("in", data[itemField], "reward") : [];
    const cash = cashField ? number(data[cashField]) : null; if (cash !== null) movements.push({ direction: "in", resourceType: "cash", amount: cash, unit: "dollar", role: "reward", attributes: {} });
    if (!movements.length) throw new UnsupportedVariantError(`${name} has no supported reward movement.`);
    return [createCanonicalEvent({ sourceLogId, eventTimestamp: Number(rawLog.timestamp), eventType: "reward", parserName: name, parserVersion: "1.0.0", counterparties: [participant("source", source)], movements, attributes: { mechanic: name }, sourceMetadata: metadata(rawLog) })];
  } });
}
export const CrimeItemRewardParser = reward({ name: "crime-item-reward", logType: 9020, title: "Crime success item gain \\(new\\)", itemField: "items_gained", source: "system" });
export const CrimeCashRewardParser = reward({ name: "crime-cash-reward", logType: 9015, title: "Crime success money gain \\(new\\)", cashField: "money_gained", source: "system" });
export const FactionItemRewardParser = reward({ name: "faction-item-receive", logType: 6733, title: "Faction give item receive", itemField: "item", source: "faction" });
export const CityItemFindParser = reward({ name: "city-item-find", logType: 7011, title: "City item find", itemField: "item", source: "system" });

export const CoreInventoryParsers = Object.freeze([CityShopPurchaseParser, BazaarPurchaseParser, ItemMarketPurchaseParser, LegacyItemMarketPurchaseParser, LegacyBazaarPurchaseParser, AbroadPurchaseParser, GrenadeBoxConversionParser, MedicalBoxConversionParser, StashBoxConversionParser, LegacyItemMarketSaleParser, ItemMarketSaleParser, LegacyBazaarSaleParser, BazaarSaleParser, CityShopSaleParser, ...TransferParsers, TradeParser, CrimeItemRewardParser, CrimeCashRewardParser, FactionItemRewardParser, CityItemFindParser]);
