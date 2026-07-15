/**
 * Imports Torn inventory pages into the application's OwnedItem model.
 * This is the only module that understands Torn's inventory response shape.
 */
import { API } from "../../api.js";
import { OwnedItem } from "../../models.js";

const CATEGORIES = [
  "Collectible", "Clothing", "Other", "Tool", "Melee", "Defensive", "Material",
  "Car", "Primary", "Secondary", "Book", "Special", "Supply Pack", "Temporary",
  "Enhancer", "Artifact", "Flower", "Booster", "Medical", "Candy", "Jewelry",
  "Alcohol", "Plushie", "Drug", "Energy Drink",
];
const PAGE_SIZE = 100;

export function normalizeInventoryItem(item, category, timestamp){
  return new OwnedItem({
    id: item.id,
    name: item.name,
    category,
    // Unique equipment may be returned once per UID without an amount.
    locations: { inventory: item.amount ?? item.quantity ?? item.qty ?? 1 },
    metadata: {
      created: timestamp,
      lastUpdated: timestamp,
      sources: ["inventory"],
    },
  });
}

export const InventoryImporter = {
  async import(progress){
    const importedItems = [];

    for(let categoryIndex = 0; categoryIndex < CATEGORIES.length; categoryIndex++){
      const category = CATEGORIES[categoryIndex];
      let offset = 0;
      let loaded = 0;

      progress?.({
        phase: "category",
        current: categoryIndex + 1,
        total: CATEGORIES.length,
        category,
      });

      while(true){
        const response = await API.getInventoryPage(category, offset, PAGE_SIZE);
        const inventory = response.inventory ?? {};
        const pageItems = inventory.items ?? [];
        const timestamp = Date.now();

        importedItems.push(
          ...pageItems.map((item) => normalizeInventoryItem(item, category, timestamp)),
        );
        loaded += pageItems.length;
        progress?.({ category, count: loaded, total: response._metadata?.total ?? loaded });

        if (!response._metadata?.links?.next) break;
        offset += PAGE_SIZE;
      }
    }

    return { items: importedItems, status: { state: "complete", label: "Complete", detail: null } };
  },
};
