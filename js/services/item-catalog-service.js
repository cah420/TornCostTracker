/**
 * Downloads global Torn item reference data through the shared API queue.
 */
import { API } from "../api.js";
import { ItemCatalogStore } from "../stores/item-catalog.js";
import { MarketValueService } from "./market-value-service.js";

let pending = null;

export const ItemCatalogService = {
  async ensureLoaded(){
    if (ItemCatalogStore.count()) return ItemCatalogStore.all();
    return this.refresh();
  },
  async refresh(){
    if (!pending) {
      pending = API.getTornItems()
        .then((response) => {
          const items = response?.items ?? [];
          ItemCatalogStore.replace(items);
          MarketValueService.ingest(items);
          return ItemCatalogStore.all();
        })
        .finally(() => { pending = null; });
    }
    return pending;
  },
};
