/**
 * Coordinates item importers and reports a synchronization summary.
 */
import { ItemStore } from "../stores/items.js";
import { Events } from "../events.js";
import { Storage } from "../storage.js";
import { BazaarImporter } from "./importers/bazaar-importer.js";
import { InventoryImporter } from "./importers/inventory-importer.js";

const SYNC_STATE_KEY = "tct.items.syncState";
const DEFAULT_SOURCE_STATES = {
  inventory: { state: "idle", label: "Not synchronized", detail: null },
  bazaar: { state: "idle", label: "Not synchronized", detail: null },
  displayCase: { state: "disabled", label: "Not Enabled", detail: null },
  itemMarket: { state: "disabled", label: "Not Enabled", detail: null },
};
const savedState = Storage.load(SYNC_STATE_KEY, {});
const sourceStates = Object.fromEntries(
  Object.entries(DEFAULT_SOURCE_STATES).map(([source, defaults])=>[
    source,
    { ...defaults, ...(savedState.sources?.[source] ?? {}) },
  ]),
);
let lastSummary = savedState.summary ?? null;

function persistState(){
  Storage.save(SYNC_STATE_KEY, { sources: sourceStates, summary: lastSummary });
}

function report(progress, details){
  progress?.(details);
  Events.emit("statusChanged", details);
}

function setSourceState(source, state, label, detail = null){
  sourceStates[source] = { state, label, detail };
  persistState();
}

export const ItemSyncService = {
  state(){
    return {
      sources: structuredClone(sourceStates),
      summary: lastSummary ? { ...lastSummary } : null,
      statistics: ItemStore.statistics(),
    };
  },
  async synchronize(progress){
    const startedAt = Date.now();

    try{
      setSourceState("inventory", "loading", "Synchronizing");
      report(progress,{stage:"inventory",status:"loading",message:"Downloading Inventory..."});
      const inventoryItems = await InventoryImporter.import((details)=>report(progress,{
        stage:"inventory",
        status:"loading",
        message:"Downloading Inventory...",
        details,
      }));
      ItemStore.merge(inventoryItems,{replaceSources:["inventory"]});
      setSourceState("inventory", "complete", "Complete");
      report(progress,{stage:"inventory",status:"complete",message:"Inventory Complete"});

      setSourceState("bazaar", "loading", "Synchronizing");
      report(progress,{stage:"bazaar",status:"loading",message:"Downloading Bazaar..."});
      const bazaarImport = await BazaarImporter.import((details)=>report(progress,{
        stage:"bazaar",
        status:"loading",
        message:"Downloading Bazaar...",
        details,
      }));
      if (bazaarImport.status.state === "complete") {
        ItemStore.merge(bazaarImport.items,{replaceSources:["bazaar"]});
      }
      setSourceState(
        "bazaar",
        bazaarImport.status.state,
        bazaarImport.status.label,
        bazaarImport.status.detail,
      );
      report(progress,{
        stage:"bazaar",
        status:bazaarImport.status.state,
        message:bazaarImport.status.state === "unavailable" ? "Bazaar Closed" : "Bazaar Complete",
      });

      report(progress,{stage:"database",status:"loading",message:"Building Item Database..."});
      const statistics = ItemStore.statistics();
      const summary = {
        inventoryItemCount: inventoryItems.length,
        bazaarItemCount: bazaarImport.items.length,
        totalUniqueOwnedItems: statistics.uniqueItems,
        totalItemQuantity: statistics.totalQuantity,
        duration: Date.now() - startedAt,
      };
      lastSummary = summary;
      persistState();
      report(progress,{stage:"database",status:"complete",message:"Complete",summary});
      Events.emit("itemsSynced", { summary, statistics });
      return summary;
    }catch(error){
      const source = sourceStates.inventory.state === "loading" ? "inventory" : "bazaar";
      setSourceState(source, "failed", "Failed", error.message);
      report(progress,{stage:"error",status:"error",message:`Synchronization failed: ${error.message}`,error});
      throw error;
    }
  },
};
