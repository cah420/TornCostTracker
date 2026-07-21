import { Storage } from "../storage.js";

const KEY = "tct.marketValues";
let cache = Storage.load(KEY, { updatedAt: null, values: {} });

function money(value){
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalize(item){
  const marketPrice = money(item?.value?.market_price);
  const vendorSellPrice = money(item?.value?.sell_price);
  return {
    itemId: Number(item?.id),
    marketPrice,
    vendorSellPrice,
    effectiveValue: marketPrice === null && vendorSellPrice === null ? null : Math.max(marketPrice ?? 0, vendorSellPrice ?? 0),
  };
}

export const MarketValueStore = {
  replace(items = []){
    const values = Object.fromEntries(items.map(normalize)
      .filter((value) => Number.isFinite(value.itemId))
      .map((value) => [value.itemId, value]));
    cache = { updatedAt: Date.now(), values };
    Storage.save(KEY, cache);
    return this.count();
  },
  lookup(itemId){ return structuredClone((cache.values ?? {})[Number(itemId)] ?? null); },
  all(){ return structuredClone(cache.values ?? {}); },
  count(){ return Object.keys(cache.values ?? {}).length; },
  updatedAt(){ return cache.updatedAt; },
  clear(){ cache = { updatedAt: null, values: {} }; Storage.remove(KEY); },
};
