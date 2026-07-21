/**
 * Account-scoped ledger persistence. Cost lots and conversion records share
 * one storage document so a completed conversion is committed atomically.
 */
import { Storage } from "../storage.js";

const KEY = "tct.inventoryLedger";
let ledger = Storage.load(KEY, {});

function playerKey(playerId){
  if (playerId === null || playerId === undefined || playerId === "") throw new Error("Inventory ledger requires a connected player.");
  return String(playerId);
}

function stateFor(playerId){
  const key = playerKey(playerId);
  ledger[key] ??= { lots: [], processedEventIds: [], conversionEvents: [], conversions: [] };
  return ledger[key];
}

function persist(){ Storage.save(KEY, ledger); }
function copy(value){ return structuredClone(value); }

export const InventoryLedgerStore = {
  snapshot(playerId){ return copy(stateFor(playerId)); },
  transaction(playerId, callback){
    const key = playerKey(playerId);
    const previous = ledger[key];
    const draft = copy(stateFor(playerId));
    const result = callback(draft);
    ledger[key] = draft;
    try {
      persist();
    } catch (error) {
      if (previous === undefined) delete ledger[key];
      else ledger[key] = previous;
      throw error;
    }
    return result;
  },
  clear(playerId){
    delete ledger[playerKey(playerId)];
    persist();
  },
  clearAll(){
    ledger = {};
    Storage.remove(KEY);
  },
};

export const CostLotStore = {
  all(playerId){ return InventoryLedgerStore.snapshot(playerId).lots; },
};

export const ConversionStore = {
  all(playerId){ return InventoryLedgerStore.snapshot(playerId).conversions.sort((left, right) => right.timestamp - left.timestamp || String(right.id).localeCompare(String(left.id))); },
  events(playerId){ return InventoryLedgerStore.snapshot(playerId).conversionEvents; },
  mergeEvents(playerId, events = []){
    return InventoryLedgerStore.transaction(playerId, (state) => {
      const existing = new Map(state.conversionEvents.map((event) => [String(event.id), event]));
      events.forEach((event) => existing.set(String(event.id), structuredClone(event)));
      state.conversionEvents = [...existing.values()].sort((left, right) => left.timestamp - right.timestamp || String(left.id).localeCompare(String(right.id)));
      return copy(state.conversionEvents);
    });
  },
  clear(playerId){ InventoryLedgerStore.clear(playerId); },
  clearAll(){ InventoryLedgerStore.clearAll(); },
};
