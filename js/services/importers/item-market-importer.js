/**
 * Imports the player's Torn Item Market listings into OwnedItem-compatible records.
 * This is the only module that understands Item Market response fields.
 */
import { API } from "../../api.js";
import { OwnedItem } from "../../models.js";

const PAGE_SIZE = 100;

export function normalizeItemMarketListing(listing, timestamp){
  const item = listing.item ?? listing;
  const id = item.id ?? listing.item_id ?? listing.id ?? listing.ID;

  return new OwnedItem({
    id,
    name: item.name ?? listing.name ?? `Item #${id}`,
    category: item.category ?? item.type ?? listing.category ?? listing.type ?? "Unknown",
    locations: {
      itemMarket: {
        quantity: listing.quantity ?? listing.amount ?? listing.qty ?? item.quantity ?? item.amount ?? item.qty ?? 1,
        updated: timestamp,
      },
    },
    metadata: {
      created: timestamp,
      lastUpdated: timestamp,
      sources: ["itemMarket"],
    },
  });
}

export const ItemMarketImporter = {
  async import(progress){
    const importedItems = [];
    let offset = 0;

    while(true){
      const response = await API.getItemMarketPage(offset);
      const market = response.itemmarket ?? [];
      const listings = Array.isArray(market) ? market : market.items ?? market.listings ?? [];
      const timestamp = Date.now();

      importedItems.push(...listings.map((listing)=>normalizeItemMarketListing(listing,timestamp)));
      progress?.({ current: importedItems.length, total: response._metadata?.total ?? importedItems.length });

      if (!response._metadata?.links?.next && listings.length < PAGE_SIZE) break;
      offset += listings.length || PAGE_SIZE;
    }

    return { items: importedItems, status: { state: "complete", label: "Complete", detail: null } };
  },
};
