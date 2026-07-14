/**
 * Persistent Torn item reference data, independent from player-owned items.
 */
import { Storage } from "../storage.js";

const KEY = "tct.itemCatalog";
let catalog = Storage.load(KEY, { updatedAt: null, items: [] });

function normalize(item){
  return {
    id: Number(item?.id),
    name: String(item?.name ?? ""),
    category: String(item?.type ?? item?.category ?? ""),
  };
}

function valid(item){
  return Number.isFinite(item.id) && item.name;
}

function copy(value){
  return structuredClone(value);
}

export const ItemCatalogStore = {
  all(){
    return copy(catalog.items);
  },
  count(){
    return catalog.items.length;
  },
  nameFor(itemId){
    return catalog.items.find((item) => item.id === Number(itemId))?.name ?? null;
  },
  updatedAt(){
    return catalog.updatedAt;
  },
  replace(items = []){
    const deduped = new Map(items.map(normalize).filter(valid).map((item) => [item.id, item]));
    catalog = { updatedAt: Date.now(), items: [...deduped.values()] };
    Storage.save(KEY, catalog);
    return this.count();
  },
  clear(){
    catalog = { updatedAt: null, items: [] };
    Storage.remove(KEY);
  },
};
