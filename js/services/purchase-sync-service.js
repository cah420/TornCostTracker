/**
 * Coordinates account-scoped purchase-log synchronization.
 * It is independent from ItemSyncService while sharing the API request queue.
 */
import { Events } from "../events.js";
import { PlayerStore } from "../stores/player.js";
import { PurchaseStore } from "../stores/purchases.js";
import { PurchaseLogImporter } from "./importers/purchase-log-importer.js";

const MIN_INITIAL_DAYS = 1;
const MAX_INITIAL_DAYS = 180;

function nowSeconds(){
  return Math.floor(Date.now() / 1000);
}

function currentPlayerId(){
  const playerId = PlayerStore.current()?.id;
  if (playerId === null || playerId === undefined) {
    throw new Error("Connect a Torn account before synchronizing purchases.");
  }
  return playerId;
}

function publish(event, payload){
  Events.emit(event, payload);
  if (event === "purchaseSyncProgress") Events.emit("statusChanged", payload);
}

function completionPayload(playerId, result, startedAt){
  return {
    playerId,
    statistics: PurchaseStore.statistics(playerId),
    state: PurchaseStore.state(playerId),
    recordsImported: result.records.length,
    logCount: result.logCount,
    duration: Date.now() - startedAt,
  };
}

async function run({ playerId, mode, fromTimestamp, checkpoint }){
  const startedAt = Date.now();
  PurchaseStore.updateState(playerId, { lastAttemptedAt: startedAt, lastError: null });
  publish("purchaseSyncStarted", { playerId, mode, message: mode === "initial" ? "Starting purchase history setup..." : "Synchronizing purchases..." });
  publish("statusChanged", { stage: "purchases", status: "loading", message: mode === "initial" ? "Downloading purchase history..." : "Synchronizing purchases..." });

  try {
    const result = await PurchaseLogImporter.import({
      fromTimestamp,
      checkpoint,
      progress: (progress) => publish("purchaseSyncProgress", { playerId, mode, stage: "purchases", status: "loading", ...progress }),
    });
    PurchaseStore.merge(playerId, result.records);
    const importedAt = Date.now();
    const newestCheckpoint = result.checkpoint.timestamp === null
      ? {}
      : { newestTimestamp: result.checkpoint.timestamp, newestLogIds: result.checkpoint.logIds };
    PurchaseStore.updateState(playerId, {
      ...(mode === "initial" ? { initialSyncComplete: true, initialFromTimestamp: fromTimestamp } : {}),
      ...newestCheckpoint,
      lastSuccessfulAt: importedAt,
      lastError: null,
    });
    const completed = completionPayload(playerId, result, startedAt);
    publish("purchaseSyncCompleted", completed);
    publish("statusChanged", { stage: "purchases", status: "complete", message: "Purchase synchronization complete." });
    return completed;
  } catch (error) {
    PurchaseStore.updateState(playerId, { lastError: error.message });
    const failure = { playerId, mode, error, message: `Purchase synchronization failed: ${error.message}` };
    publish("purchaseSyncFailed", failure);
    publish("statusChanged", { stage: "purchases", status: "failed", message: failure.message });
    throw error;
  }
}

export const PurchaseSyncService = {
  constraints: { minInitialDays: MIN_INITIAL_DAYS, maxInitialDays: MAX_INITIAL_DAYS },
  state(){
    const playerId = currentPlayerId();
    return {
      playerId,
      sync: PurchaseStore.state(playerId),
      statistics: PurchaseStore.statistics(playerId),
      records: PurchaseStore.all(playerId),
    };
  },
  async initialSync(days){
    if (!Number.isInteger(days) || days < MIN_INITIAL_DAYS || days > MAX_INITIAL_DAYS) {
      throw new Error(`Choose a whole number of days from ${MIN_INITIAL_DAYS} to ${MAX_INITIAL_DAYS}.`);
    }
    const playerId = currentPlayerId();
    const existing = PurchaseStore.state(playerId);
    // Reuse an unfinished boundary so retrying never widens the user-selected range.
    const fromTimestamp = existing.initialSyncComplete
      ? nowSeconds() - days * 86400
      : existing.initialFromTimestamp ?? nowSeconds() - days * 86400;
    if (!existing.initialSyncComplete && existing.initialFromTimestamp === null) {
      PurchaseStore.updateState(playerId, { initialFromTimestamp: fromTimestamp });
    }
    return run({ playerId, mode: "initial", fromTimestamp, checkpoint: null });
  },
  async incrementalSync(){
    const playerId = currentPlayerId();
    const state = PurchaseStore.state(playerId);
    if (!state.initialSyncComplete) {
      throw new Error("Complete initial purchase history setup first.");
    }
    return run({
      playerId,
      mode: "incremental",
      fromTimestamp: state.newestTimestamp,
      checkpoint: { timestamp: state.newestTimestamp, logIds: state.newestLogIds },
    });
  },
  resetCurrent(){
    const playerId = currentPlayerId();
    PurchaseStore.reset(playerId);
    return playerId;
  },
};
