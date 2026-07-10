/**
 * Coordinates item importers and reports a synchronization summary.
 */
import { ItemStore } from "../stores/items.js";
import { BazaarImporter } from "./importers/bazaar-importer.js";
import { InventoryImporter } from "./importers/inventory-importer.js";

function report(progress, details){
  progress?.(details);
}

export const ItemSyncService = {
  async synchronize(progress){
    const startedAt = Date.now();

    try{
      report(progress,{stage:"inventory",status:"loading",message:"Downloading Inventory..."});
      const inventoryItems = await InventoryImporter.import((details)=>report(progress,{
        stage:"inventory",
        status:"loading",
        message:"Downloading Inventory...",
        details,
      }));
      ItemStore.merge(inventoryItems,{replaceSources:["inventory"]});
      report(progress,{stage:"inventory",status:"complete",message:"Inventory Complete"});

      report(progress,{stage:"bazaar",status:"loading",message:"Downloading Bazaar..."});
      const bazaarItems = await BazaarImporter.import((details)=>report(progress,{
        stage:"bazaar",
        status:"loading",
        message:"Downloading Bazaar...",
        details,
      }));
      ItemStore.merge(bazaarItems,{replaceSources:["bazaar"]});
      report(progress,{stage:"bazaar",status:"complete",message:"Bazaar Complete"});

      report(progress,{stage:"database",status:"loading",message:"Building Item Database..."});
      const statistics = ItemStore.statistics();
      const summary = {
        inventoryItemCount: inventoryItems.length,
        bazaarItemCount: bazaarItems.length,
        totalUniqueOwnedItems: statistics.uniqueItems,
        totalItemQuantity: statistics.totalQuantity,
        duration: Date.now() - startedAt,
      };
      report(progress,{stage:"database",status:"complete",message:"Complete",summary});
      return summary;
    }catch(error){
      report(progress,{stage:"error",status:"error",message:`Synchronization failed: ${error.message}`,error});
      throw error;
    }
  },
};
