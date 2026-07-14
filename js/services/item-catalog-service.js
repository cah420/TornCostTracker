/**
 * Downloads global Torn item reference data through the shared API queue.
 */
import { API } from "../api.js";
import { ItemCatalogStore } from "../stores/item-catalog.js";

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
          ItemCatalogStore.replace(response?.items ?? []);
          return ItemCatalogStore.all();
        })
        .finally(() => { pending = null; });
    }
    return pending;
  },
};
