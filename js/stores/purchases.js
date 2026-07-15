/**
 * Persistent, account-scoped canonical acquisition storage.
 * Raw Torn log responses are deliberately never stored here.
 */
import { Acquisition } from "../models.js";
import { Storage } from "../storage.js";

const RECORDS_KEY = "tct.purchases.records";
const STATE_KEY = "tct.purchases.syncState";
const recordsByPlayer = Storage.load(RECORDS_KEY, {});
const stateByPlayer = Storage.load(STATE_KEY, {});

const DEFAULT_STATE = Object.freeze({
  initialSyncComplete: false,
  initialFromTimestamp: null,
  newestTimestamp: null,
  newestLogIds: [],
  lastSuccessfulAt: null,
  lastAttemptedAt: null,
  lastError: null,
});

function playerKey(playerId){
  if (playerId === null || playerId === undefined || playerId === "") {
    throw new Error("Purchase history requires a connected player.");
  }
  return String(playerId);
}

function copy(value){
  return structuredClone(value);
}

function persistRecords(){
  Storage.save(RECORDS_KEY, recordsByPlayer);
}

function persistStates(){
  Storage.save(STATE_KEY, stateByPlayer);
}

function recordsFor(playerId){
  const key = playerKey(playerId);
  if (!Array.isArray(recordsByPlayer[key])) recordsByPlayer[key] = [];
  const legacyRecords = recordsByPlayer[key];
  if (legacyRecords.some((record) => !record?.acquisitionKind || !record?.costStatus || !record?.acquisitionMethod)) {
    recordsByPlayer[key] = legacyRecords.map((record) => Acquisition.from(record).toJSON());
    persistRecords();
  }
  return recordsByPlayer[key];
}

function stateFor(playerId){
  const key = playerKey(playerId);
  stateByPlayer[key] = { ...DEFAULT_STATE, ...(stateByPlayer[key] ?? {}) };
  return stateByPlayer[key];
}

function sorted(records){
  return [...records].sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id));
}

export const PurchaseStore = {
  merge(playerId, acquisitions = []){
    const existing = new Map(recordsFor(playerId).map((record) => [record.id, record]));
    acquisitions.forEach((record) => {
      const normalized = Acquisition.from(record).toJSON();
      existing.set(normalized.id, normalized);
    });
    recordsByPlayer[playerKey(playerId)] = sorted([...existing.values()]);
    persistRecords();
    return this.all(playerId);
  },
  all(playerId){
    return copy(sorted(recordsFor(playerId)));
  },
  byItem(playerId, itemId){
    return this.all(playerId).filter((record) => record.itemLines.some((line) => line.itemId === Number(itemId)));
  },
  byDateRange(playerId, fromTimestamp, toTimestamp){
    return this.all(playerId).filter((record) =>
      (fromTimestamp === null || record.timestamp >= fromTimestamp) &&
      (toTimestamp === null || record.timestamp <= toTimestamp),
    );
  },
  latestTimestamp(playerId){
    return this.all(playerId).at(0)?.timestamp ?? null;
  },
  oldestTimestamp(playerId){
    const records = this.all(playerId);
    return records.at(-1)?.timestamp ?? null;
  },
  statistics(playerId){
    const records = this.all(playerId);
    return {
      acquisitionCount: records.length,
      oldestTimestamp: records.at(-1)?.timestamp ?? null,
      newestTimestamp: records.at(0)?.timestamp ?? null,
      unresolvedTradeCount: records.filter((record) => record.sourceType === "trade" && record.allocationStatus === "unresolved").length,
    };
  },
  state(playerId){
    return copy(stateFor(playerId));
  },
  updateState(playerId, update = {}){
    Object.assign(stateFor(playerId), update);
    persistStates();
    return this.state(playerId);
  },
  reset(playerId){
    const key = playerKey(playerId);
    delete recordsByPlayer[key];
    delete stateByPlayer[key];
    persistRecords();
    persistStates();
  },
  clearAll(){
    Object.keys(recordsByPlayer).forEach((key) => delete recordsByPlayer[key]);
    Object.keys(stateByPlayer).forEach((key) => delete stateByPlayer[key]);
    Storage.remove(RECORDS_KEY);
    Storage.remove(STATE_KEY);
  },
};
