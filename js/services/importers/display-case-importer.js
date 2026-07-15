/**
 * Imports the player's Torn Display Case into OwnedItem-compatible records.
 * This is the only module that understands Display Case response fields.
 */
import { API } from "../../api.js";
import { OwnedItem } from "../../models.js";

export function normalizeDisplayCaseItem(item, timestamp){
  const id = item.id ?? item.ID ?? item.item_id;

  return new OwnedItem({
    id,
    name: item.name ?? item.item_name ?? `Item #${id}`,
    category: item.category ?? item.type ?? "Unknown",
    locations: {
      displayCase: { quantity: item.quantity ?? item.amount ?? item.qty ?? 1, updated: timestamp },
    },
    metadata: {
      created: timestamp,
      lastUpdated: timestamp,
      sources: ["displayCase"],
    },
  });
}

export const DisplayCaseImporter = {
  async import(progress){
    const response = await API.getDisplayCase();
    const display = response.display ?? [];
    const displayItems = Array.isArray(display) ? display : display.items ?? [];
    const timestamp = Date.now();
    const items = displayItems.map((item)=>normalizeDisplayCaseItem(item,timestamp));

    progress?.({ current: items.length, total: items.length });
    return { items, status: { state: "complete", label: "Complete", detail: null } };
  },
};
