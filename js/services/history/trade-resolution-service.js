import { TradeResolutionRepository } from "../../database/trade-resolution-repository.js";
import { stableStringify } from "../raw-log-serialization.js";
import { projectTradeResolution } from "./trade-resolution-projector.js";
import { ACCOUNTING_PROJECTION_VERSION } from "./accounting-projection.js";
import { ACCOUNTING_LEDGER_VERSION } from "./accounting-ledger.js";
import { COST_LOT_VERSION } from "./cost-lot.js";
import { FIFO_VERSION } from "./fifo-consumption.js";
import { INVENTORY_POSITION_VERSION } from "./inventory-position.js";

export const TRADE_RESOLUTION_SCHEMA_VERSION = 1;
export const TRADE_RESOLVER_VERSION = "1.0.0";
export const TRADE_ACCOUNTING_POLICY_VERSION = 1;

function positiveInteger(value, field){
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${field} must be a positive integer.`);
  return number;
}
function nonnegativeInteger(value, field){
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${field} must be a nonnegative integer.`);
  return number;
}
function tradeIdFor(event){ return String(event?.attributes?.tradeId ?? ""); }
function movementQuantity(movement){ return positiveInteger(movement.quantity, "Trade item quantity"); }
function cashAmount(movement){ return positiveInteger(movement.amount, "Trade cash amount"); }
function emptyTrade(tradeId){
  return { tradeId, opaqueTradeIds: [], correlationConflict: false, completed: false, completionSourceLogId: null, timestamp: 0, counterpartyId: null, cashSent: 0, cashReceived: 0, itemsSent: [], itemsReceived: [], sourceEventIds: [] };
}
function groupItems(lines){
  const groups = new Map();
  lines.forEach((line) => {
    const itemId = String(line.itemId);
    const group = groups.get(itemId) ?? { itemId, quantity: 0, uids: [], evidenceLines: 0 };
    group.quantity += line.quantity; group.evidenceLines += 1;
    if (line.uid) group.uids.push(String(line.uid));
    groups.set(itemId, group);
  });
  return [...groups.values()].sort((left, right) => Number(left.itemId) - Number(right.itemId) || left.itemId.localeCompare(right.itemId));
}
function evidenceHash(trade){
  return stableStringify({
    tradeId: trade.tradeId, opaqueTradeIds: trade.opaqueTradeIds, correlationConflict: trade.correlationConflict, completed: trade.completed, completionSourceLogId: trade.completionSourceLogId,
    timestamp: trade.timestamp, counterpartyId: trade.counterpartyId, cashSent: trade.cashSent, cashReceived: trade.cashReceived,
    itemsSent: trade.itemsSent, itemsReceived: trade.itemsReceived, sourceEventIds: [...trade.sourceEventIds].sort(),
  });
}
function allocationForGroup(group, totalBasis){
  const basis = nonnegativeInteger(totalBasis, "Allocated total");
  const uniqueUids = [...new Set(group.uids)].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (uniqueUids.length && uniqueUids.length !== group.quantity) throw new Error(`Item #${group.itemId} mixes UID and fungible quantity and requires additional evidence.`);
  let lots;
  if (uniqueUids.length) {
    const base = Math.floor(basis / uniqueUids.length); const remainder = basis % uniqueUids.length;
    lots = uniqueUids.map((uid, index) => ({ uid, quantity: 1, allocatedBasis: base + (index < remainder ? 1 : 0), allocationOrder: index }));
  } else {
    lots = [{ uid: null, quantity: group.quantity, allocatedBasis: basis, allocationOrder: 0 }];
  }
  return {
    itemId: group.itemId,
    quantity: group.quantity,
    uids: uniqueUids,
    uidCount: uniqueUids.length,
    totalBasis: basis,
    unitBasis: basis % group.quantity === 0 ? basis / group.quantity : null,
    lots,
  };
}
function materiallyEqual(active, desired){
  return active &&
    active.evidenceHash === desired.evidenceHash &&
    active.resolverVersion === desired.resolverVersion &&
    active.accountingPolicyVersion === desired.accountingPolicyVersion &&
    active.resolutionMethod === desired.resolutionMethod &&
    stableStringify(active.allocations) === stableStringify(desired.allocations);
}

export function correlateTradeEvidence(events){
  const trades = new Map();
  events.forEach((event) => {
    const tradeId = tradeIdFor(event); if (!tradeId) return;
    const trade = trades.get(tradeId) ?? emptyTrade(tradeId);
    trade.sourceEventIds.push(event.id);
    if (event.attributes?.opaqueTradeId) trade.opaqueTradeIds.push(String(event.attributes.opaqueTradeId));
    trade.timestamp = Math.max(trade.timestamp, Number(event.eventTimestamp) || 0);
    trade.counterpartyId ??= event.counterparties?.find((entry) => entry.role === "trade_partner")?.entityId ?? null;
    if (event.parserName === "trade-completed-evidence") { trade.completed = true; trade.completionSourceLogId = event.sourceLogId; }
    if (event.parserName === "trade-money-outgoing-evidence") trade.cashSent += event.movements.filter((movement) => movement.resourceType === "cash").reduce((sum, movement) => sum + cashAmount(movement), 0);
    if (event.parserName === "trade-money-incoming-evidence") trade.cashReceived += event.movements.filter((movement) => movement.resourceType === "cash").reduce((sum, movement) => sum + cashAmount(movement), 0);
    if (event.parserName === "trade-items-outgoing-evidence" || event.parserName === "trade-items-incoming") {
      const target = event.parserName === "trade-items-outgoing-evidence" ? trade.itemsSent : trade.itemsReceived;
      event.movements.filter((movement) => movement.resourceType === "item").forEach((movement) => target.push({ itemId: String(movement.resourceId), quantity: movementQuantity(movement), uid: movement.attributes?.uid && movement.attributes.uid !== "0" ? String(movement.attributes.uid) : null, sourceEventId: event.id }));
    }
    trades.set(tradeId, trade);
  });
  return [...trades.values()].map((trade) => {
    const opaqueTradeIds = [...new Set(trade.opaqueTradeIds)].sort();
    return {
    ...trade, opaqueTradeIds, correlationConflict: opaqueTradeIds.length > 1,
    itemGroups: groupItems(trade.itemsReceived),
    sentItemGroups: groupItems(trade.itemsSent),
    evidenceHash: evidenceHash({ ...trade, opaqueTradeIds, correlationConflict: opaqueTradeIds.length > 1 }),
  }; }).sort((left, right) => right.timestamp - left.timestamp || right.tradeId.localeCompare(left.tradeId));
}

export function isEligibleTrade(trade){
  return Boolean(!trade.correlationConflict && trade.completed && trade.completionSourceLogId && trade.cashSent > 0 && trade.cashReceived === 0 && trade.itemsSent.length === 0 && trade.itemsReceived.length > 0);
}

export class TradeResolutionService {
  constructor({ repository = new TradeResolutionRepository(), now = () => Date.now() } = {}){ this.repository = repository; this.now = now; }

  async evidence(){ return correlateTradeEvidence(await this.repository.listEvidence()); }

  async dashboard(){
    const [trades, active] = await Promise.all([this.evidence(), this.repository.listActive()]);
    const activeByTrade = new Map(active.map((resolution) => [resolution.tradeId, resolution]));
    const eligible = trades.filter(isEligibleTrade);
    for (const trade of trades) {
      const resolution = activeByTrade.get(trade.tradeId);
      if (resolution && resolution.evidenceHash !== trade.evidenceHash && resolution.status !== "needs_review") {
        await this.repository.markNeedsReview(resolution.id);
        resolution.status = "needs_review";
      }
    }
    const unresolved = eligible.filter((trade) => !activeByTrade.has(trade.tradeId));
    const refreshed = [...activeByTrade.values()];
    return {
      trades,
      eligible,
      ready: unresolved.filter((trade) => trade.itemGroups.length > 1),
      automaticCandidates: unresolved.filter((trade) => trade.itemGroups.length === 1),
      automaticallyResolved: refreshed.filter((resolution) => resolution.resolutionMethod === "automatic_single_item" && resolution.status === "active"),
      resolved: refreshed.filter((resolution) => resolution.status === "active"),
      needsReview: refreshed.filter((resolution) => resolution.status === "needs_review"),
      summary: {
        eligible: eligible.length,
        automaticallyResolved: refreshed.filter((resolution) => resolution.resolutionMethod === "automatic_single_item" && resolution.status === "active").length,
        manualRequired: unresolved.filter((trade) => trade.itemGroups.length > 1).length,
        resolved: refreshed.filter((resolution) => resolution.status === "active").length,
        outstanding: unresolved.length + refreshed.filter((resolution) => resolution.status === "needs_review").length,
      },
    };
  }

  async resolveAutomaticCandidates(){
    const dashboard = await this.dashboard(); const results = [];
    for (const trade of dashboard.automaticCandidates) results.push(await this.resolve(trade.tradeId, [{ itemId: trade.itemGroups[0].itemId, totalBasis: trade.cashSent }], "automatic_single_item"));
    return results;
  }

  async resolve(tradeId, requestedAllocations, resolutionMethod = "manual_multi_item"){
    const trade = (await this.evidence()).find((candidate) => candidate.tradeId === String(tradeId));
    if (!trade || !isEligibleTrade(trade)) throw new Error("Trade is not eligible for acquisition resolution.");
    if (resolutionMethod === "automatic_single_item" && trade.itemGroups.length !== 1) throw new Error("Automatic resolution requires exactly one canonical Item ID.");
    const requested = new Map((requestedAllocations ?? []).map((entry) => [String(entry.itemId), nonnegativeInteger(entry.totalBasis, "Allocated total")]));
    if (requested.size !== trade.itemGroups.length || trade.itemGroups.some((group) => !requested.has(group.itemId))) throw new Error("Allocations must cover every received Item ID exactly once.");
    const allocatedTotal = [...requested.values()].reduce((sum, value) => sum + value, 0);
    if (allocatedTotal !== trade.cashSent) throw new Error(`Allocated totals must equal cash sent (${trade.cashSent}).`);
    const allocations = trade.itemGroups.map((group) => allocationForGroup(group, requested.get(group.itemId)));
    const previous = await this.repository.activeForTrade(trade.tradeId);
    if (previous?.resolutionMethod === "manual_multi_item" && resolutionMethod === "automatic_single_item") return { resolution: previous, created: false };
    const timestamp = this.now();
    const resolutionVersion = (previous?.resolutionVersion ?? 0) + 1;
    const resolution = {
      id: `trade-resolution:${trade.tradeId}:${resolutionVersion}`,
      tradeId: trade.tradeId,
      resolutionVersion,
      schemaVersion: TRADE_RESOLUTION_SCHEMA_VERSION,
      resolverVersion: TRADE_RESOLVER_VERSION,
      accountingPolicyVersion: TRADE_ACCOUNTING_POLICY_VERSION,
      status: "active",
      resolutionMethod,
      totalCashSent: trade.cashSent,
      allocations,
      evidenceHash: trade.evidenceHash,
      completionSourceLogId: trade.completionSourceLogId,
      counterpartyId: trade.counterpartyId,
      tradeTimestamp: trade.timestamp,
      supersedesResolutionId: previous?.id ?? null,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: timestamp,
    };
    if (materiallyEqual(previous, resolution)) return { resolution: previous, created: false };
    const canonicalEvents = projectTradeResolution(resolution);
    await this.repository.saveRevision(resolution, canonicalEvents, {
      previous,
      derivedVersions: {
        projection: ACCOUNTING_PROJECTION_VERSION,
        ledger: ACCOUNTING_LEDGER_VERSION,
        costLot: COST_LOT_VERSION,
        fifo: FIFO_VERSION,
        position: INVENTORY_POSITION_VERSION,
      },
    });
    return { resolution, canonicalEvents, created: true };
  }

  history(tradeId){ return this.repository.historyForTrade(tradeId); }
}

export const TradeResolutions = new TradeResolutionService();
