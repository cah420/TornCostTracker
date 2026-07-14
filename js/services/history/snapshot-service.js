/**
 * Captures owned-item history after synchronization completion events.
 */
import { Events } from "../../events.js";
import { HistoryStore } from "../../stores/history.js";
import { ItemStore } from "../../stores/items.js";

function compactItem(item){
  return {
    id: item.id,
    totalQuantity: item.totalQuantity,
    locations: Object.fromEntries(
      Object.entries(item.locations).map(([location, value])=>[
        location,
        { quantity: value.quantity, updated: value.updated },
      ]),
    ),
    metadata: {
      created: item.metadata.created,
      lastUpdated: item.metadata.lastUpdated,
    },
  };
}

function captureSnapshot(){
  const snapshot = {
    timestamp: Date.now(),
    items: ItemStore.items().map(compactItem),
  };
  return HistoryStore.saveSnapshot(snapshot);
}

let started = false;

export const SnapshotService = {
  start(){
    if (started) return;
    started = true;
    Events.on("itemsSynced", ({ summary })=>{
      if (summary.successfulSourceCount === 0) return;
      try{
        captureSnapshot();
      }catch(error){
        console.error("Unable to save synchronization snapshot:", error);
      }
    });
  },
  captureSnapshot,
};
