/**
 * Coordinates item importers and reports a synchronization summary.
 */
import { ItemStore } from "../stores/items.js";
import { Events } from "../events.js";
import { Storage } from "../storage.js";
import { BazaarImporter } from "./importers/bazaar-importer.js";
import { DisplayCaseImporter } from "./importers/display-case-importer.js";
import { InventoryImporter } from "./importers/inventory-importer.js";
import { ItemMarketImporter } from "./importers/item-market-importer.js";

const SYNC_STATE_KEY = "tct.items.syncState";
const DEFAULT_SOURCE_STATES = {
  inventory: { state: "idle", label: "Not synchronized", detail: null },
  bazaar: { state: "idle", label: "Not synchronized", detail: null },
  displayCase: { state: "idle", label: "Not synchronized", detail: null },
  itemMarket: { state: "idle", label: "Not synchronized", detail: null },
};
const savedState = Storage.load(SYNC_STATE_KEY, {});
const sourceStates = Object.fromEntries(
  Object.entries(DEFAULT_SOURCE_STATES).map(([source, defaults])=>[
    source,
    savedState.sources?.[source]?.state === "disabled"
      ? defaults
      : { ...defaults, ...(savedState.sources?.[source] ?? {}) },
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

async function synchronizeSource({ source, name, importer, progress }){
  setSourceState(source, "loading", "Synchronizing");
  report(progress,{stage:source,status:"loading",message:`Downloading ${name}...`});

  try{
    const result = await importer.import((details)=>report(progress,{
      stage:source,
      status:"loading",
      message:`Downloading ${name}...`,
      details,
    }));

    if (result.status.state === "complete") {
      ItemStore.merge(result.items,{replaceSources:[source]});
    }
    setSourceState(source,result.status.state,result.status.label,result.status.detail);
    report(progress,{
      stage:source,
      status:result.status.state,
      message:result.status.state === "complete" ? `${name} Complete` : `${name} Unavailable`,
    });
    return result;
  }catch(error){
    const detail = `Unable to synchronize ${name}. Previously cached contents were kept. ${error.message}`;
    setSourceState(source,"cached","Cached",detail);
    report(progress,{stage:source,status:"cached",message:`${name} Cached`,error});
    return { items: [], status: { state: "cached", label: "Cached", detail } };
  }
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

    const inventoryImport = await synchronizeSource({
      source:"inventory", name:"Inventory", importer:InventoryImporter, progress,
    });
    const bazaarImport = await synchronizeSource({
      source:"bazaar", name:"Bazaar", importer:BazaarImporter, progress,
    });
    const displayCaseImport = await synchronizeSource({
      source:"displayCase", name:"Display Case", importer:DisplayCaseImporter, progress,
    });
    const itemMarketImport = await synchronizeSource({
      source:"itemMarket", name:"Item Market", importer:ItemMarketImporter, progress,
    });

    report(progress,{stage:"database",status:"loading",message:"Building Item Database..."});
    const statistics = ItemStore.statistics();
    const summary = {
      inventoryItemCount: inventoryImport.items.length,
      bazaarItemCount: bazaarImport.items.length,
      displayCaseItemCount: displayCaseImport.items.length,
      itemMarketItemCount: itemMarketImport.items.length,
      totalUniqueOwnedItems: statistics.uniqueItems,
      totalItemQuantity: statistics.totalQuantity,
      duration: Date.now() - startedAt,
    };
    lastSummary = summary;
    persistState();
    report(progress,{stage:"database",status:"complete",message:"Complete",summary});
    Events.emit("itemsSynced", { summary, statistics });
    return summary;
  },
};
