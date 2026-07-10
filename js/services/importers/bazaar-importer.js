/**
 * Imports the player's Torn Bazaar into OwnedItem-compatible records.
 * This is the only module that understands Bazaar response fields.
 */
import { API } from "../../api.js";
import { OwnedItem } from "../../models.js";

const PAGE_SIZE = 100;

function normalizeBazaarItem(item, timestamp){
  const id = item.id ?? item.ID ?? item.item_id;

  return new OwnedItem({
    id,
    name: item.name ?? item.item_name ?? `Item #${id}`,
    category: item.category ?? item.type ?? "Unknown",
    locations: {
      bazaar: { quantity: item.quantity ?? item.amount ?? item.qty, updated: timestamp },
    },
    metadata: {
      created: timestamp,
      lastUpdated: timestamp,
      sources: ["bazaar"],
    },
  });
}

export const BazaarImporter = {
  async import(progress){
    const importedItems = [];
    let offset = 0;

    while(true){
      const response = await API.getBazaarPage(offset, PAGE_SIZE);
      const bazaar = response.bazaar ?? [];
      const pageItems = Array.isArray(bazaar) ? bazaar : bazaar.items ?? [];
      const timestamp = Date.now();

      importedItems.push(...pageItems.map((item) => normalizeBazaarItem(item, timestamp)));
      progress?.({ current: importedItems.length, total: response._metadata?.total ?? importedItems.length });

      if (!response._metadata?.links?.next) break;
      offset += PAGE_SIZE;
    }

    return importedItems;
  },
};
