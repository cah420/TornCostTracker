import { API } from "../api.js";
import { MarketValueStore } from "../stores/market-values.js";
import { Events } from "../events.js";

let pending = null;

export const MarketValueService = {
  lookup(itemId){ return MarketValueStore.lookup(itemId); },
  updatedAt(){ return MarketValueStore.updatedAt(); },
  async ensureLoaded(){
    return MarketValueStore.count() ? MarketValueStore.all() : this.refresh();
  },
  async refresh(){
    if (!pending) {
      pending = API.getTornItems()
        .then((response) => {
          MarketValueStore.replace(response?.items ?? []);
          Events.emit("marketValuesUpdated");
          return MarketValueStore.all();
        })
        .finally(() => { pending = null; });
    }
    return pending;
  },
  ingest(items = []){
    MarketValueStore.replace(items);
    Events.emit("marketValuesUpdated");
    return MarketValueStore.all();
  },
};
