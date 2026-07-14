/**
 * Persists compact, point-in-time owned-item snapshots.
 */
import { Storage } from "../storage.js";

const SNAPSHOTS_KEY = "tct.history.snapshots";
const RETENTION_KEY = "tct.history.retention";
const DEFAULT_RETENTION = {
  maxSnapshots: null,
  pruneBeforeTimestamp: null,
};

let snapshots = Storage.load(SNAPSHOTS_KEY, []);
let retention = { ...DEFAULT_RETENTION, ...Storage.load(RETENTION_KEY, {}) };

function copy(value){
  return structuredClone(value);
}

function persist(){
  Storage.save(SNAPSHOTS_KEY, snapshots);
}

function applyRetention(){
  if (retention.pruneBeforeTimestamp) {
    snapshots = snapshots.filter((snapshot)=>snapshot.timestamp >= retention.pruneBeforeTimestamp);
  }
  if (Number.isInteger(retention.maxSnapshots) && retention.maxSnapshots >= 0) {
    snapshots = retention.maxSnapshots === 0 ? [] : snapshots.slice(-retention.maxSnapshots);
  }
}

export const HistoryStore = {
  saveSnapshot(snapshot){
    if (!snapshot?.timestamp || !Array.isArray(snapshot.items)) {
      throw new Error("A snapshot requires a timestamp and items array.");
    }
    snapshots.push(copy(snapshot));
    applyRetention();
    persist();
    return this.getLatestSnapshot();
  },
  getLatestSnapshot(){
    return snapshots.length ? copy(snapshots.at(-1)) : null;
  },
  listSnapshots(){
    return snapshots.map(copy);
  },
  getSnapshot(timestamp){
    const snapshot = snapshots.find((candidate)=>candidate.timestamp === timestamp);
    return snapshot ? copy(snapshot) : null;
  },
  configureRetention(options = {}){
    retention = { ...retention, ...options };
    Storage.save(RETENTION_KEY, retention);
    applyRetention();
    persist();
    return { ...retention };
  },
  retention(){
    return { ...retention };
  },
};
