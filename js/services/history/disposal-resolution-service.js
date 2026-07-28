import { DisposalResolutionRepository } from "../../database/disposal-resolution-repository.js";
import { stableStringify } from "../raw-log-serialization.js";
import { correlateTradeEvidence } from "./trade-resolution-service.js";
import { projectDisposalResolution } from "./disposal-resolution-projector.js";
import { ACCOUNTING_PROJECTION_VERSION } from "./accounting-projection.js";
import { ACCOUNTING_LEDGER_VERSION } from "./accounting-ledger.js";
import { COST_LOT_VERSION } from "./cost-lot.js";
import { FIFO_VERSION } from "./fifo-consumption.js";
import { INVENTORY_POSITION_VERSION } from "./inventory-position.js";

export const DISPOSAL_RESOLUTION_SCHEMA_VERSION = 1;
export const DISPOSAL_RESOLVER_VERSION = "1.0.0";
export const DISPOSAL_ACCOUNTING_POLICY_VERSION = 1;

function nonnegativeInteger(value, field){
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${field} must be a nonnegative integer.`);
  return number;
}
function allocationForGroup(group, totalProceeds){
  const proceeds = nonnegativeInteger(totalProceeds, "Allocated proceeds");
  const uids = [...new Set(group.uids)].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (uids.length && uids.length !== group.quantity) throw new Error(`Item #${group.itemId} mixes UID and fungible quantity and requires additional evidence.`);
  const lots = uids.length
    ? uids.map((uid, index) => {
      const base = Math.floor(proceeds / uids.length); const remainder = proceeds % uids.length;
      return { uid, quantity: 1, allocatedProceeds: base + (index < remainder ? 1 : 0), allocationOrder: index };
    })
    : [{ uid: null, quantity: group.quantity, allocatedProceeds: proceeds, allocationOrder: 0 }];
  return {
    itemId: group.itemId,
    quantity: group.quantity,
    uids,
    uidCount: uids.length,
    totalProceeds: proceeds,
    unitProceeds: proceeds % group.quantity === 0 ? proceeds / group.quantity : null,
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
export function isEligibleDisposalTrade(trade){
  return Boolean(!trade.correlationConflict && trade.completed && trade.completionSourceLogId && trade.cashReceived > 0 && trade.cashSent === 0 && trade.itemsReceived.length === 0 && trade.itemsSent.length > 0);
}

export class DisposalResolutionService {
  constructor({ repository = new DisposalResolutionRepository(), now = () => Date.now() } = {}){ this.repository = repository; this.now = now; }
  async evidence(){ return correlateTradeEvidence(await this.repository.listEvidence()); }
  async dashboard(){
    const [trades, active, context] = await Promise.all([
      this.evidence(),
      this.repository.listActive(),
      this.repository.contextSummary?.(FIFO_VERSION) ?? { conversionCandidates: 0, unsupported: 0, fifoExceptions: 0 },
    ]);
    const activeByTransaction = new Map(active.map((resolution) => [resolution.sourceTransactionId, resolution]));
    const eligible = trades.filter(isEligibleDisposalTrade);
    for (const trade of trades) {
      const resolution = activeByTransaction.get(trade.tradeId);
      if (resolution && resolution.evidenceHash !== trade.evidenceHash && resolution.status !== "needs_review") {
        await this.repository.markNeedsReview(resolution.id);
        resolution.status = "needs_review";
      }
    }
    const unresolved = eligible.filter((trade) => !activeByTransaction.has(trade.tradeId));
    const resolutions = [...activeByTransaction.values()];
    const incompleteCorrelation = trades.filter((trade) => (trade.itemsSent.length > 0 || trade.cashReceived > 0) && !isEligibleDisposalTrade(trade) && !activeByTransaction.has(trade.tradeId)).length;
    return {
      trades,
      eligible,
      ready: unresolved.filter((trade) => trade.sentItemGroups.length > 1),
      automaticCandidates: unresolved.filter((trade) => trade.sentItemGroups.length === 1),
      automaticallyResolved: resolutions.filter((resolution) => resolution.resolutionMethod === "automatic_single_item" && resolution.status === "active"),
      resolved: resolutions.filter((resolution) => resolution.status === "active"),
      needsReview: resolutions.filter((resolution) => resolution.status === "needs_review"),
      summary: {
        eligible: eligible.length,
        automaticallyResolved: resolutions.filter((resolution) => resolution.resolutionMethod === "automatic_single_item" && resolution.status === "active").length,
        manualRequired: unresolved.filter((trade) => trade.sentItemGroups.length > 1).length,
        resolved: resolutions.filter((resolution) => resolution.status === "active").length,
        outstanding: unresolved.length + resolutions.filter((resolution) => resolution.status === "needs_review").length,
        unsupported: context.unsupported,
        incompleteCorrelation,
        conversionCandidates: context.conversionCandidates,
        fifoExceptions: context.fifoExceptions,
      },
    };
  }
  async resolveAutomaticCandidates(){
    const dashboard = await this.dashboard(); const results = [];
    for (const trade of dashboard.automaticCandidates) {
      results.push(await this.resolve(trade.tradeId, [{ itemId: trade.sentItemGroups[0].itemId, totalProceeds: trade.cashReceived }], "automatic_single_item"));
    }
    return results;
  }
  async resolve(sourceTransactionId, requestedAllocations, resolutionMethod = "manual_multi_item"){
    const trade = (await this.evidence()).find((candidate) => candidate.tradeId === String(sourceTransactionId));
    if (!trade || !isEligibleDisposalTrade(trade)) throw new Error("Trade is not eligible for disposal resolution.");
    if (resolutionMethod === "automatic_single_item" && trade.sentItemGroups.length !== 1) throw new Error("Automatic resolution requires exactly one canonical Item ID.");
    const requested = new Map((requestedAllocations ?? []).map((entry) => [String(entry.itemId), nonnegativeInteger(entry.totalProceeds, "Allocated proceeds")]));
    if (requested.size !== trade.sentItemGroups.length || trade.sentItemGroups.some((group) => !requested.has(group.itemId))) throw new Error("Allocations must cover every sent Item ID exactly once.");
    if ([...requested.values()].reduce((sum, value) => sum + value, 0) !== trade.cashReceived) throw new Error(`Allocated proceeds must equal cash received (${trade.cashReceived}).`);
    const allocations = trade.sentItemGroups.map((group) => allocationForGroup(group, requested.get(group.itemId)));
    const previous = await this.repository.activeForTransaction(trade.tradeId);
    if (previous?.resolutionMethod === "manual_multi_item" && resolutionMethod === "automatic_single_item") return { resolution: previous, created: false };
    const timestamp = this.now(); const resolutionVersion = (previous?.resolutionVersion ?? 0) + 1;
    const resolution = {
      id: `disposal-resolution:${trade.tradeId}:${resolutionVersion}`,
      sourceTransactionId: trade.tradeId,
      resolutionVersion,
      schemaVersion: DISPOSAL_RESOLUTION_SCHEMA_VERSION,
      resolverVersion: DISPOSAL_RESOLVER_VERSION,
      accountingPolicyVersion: DISPOSAL_ACCOUNTING_POLICY_VERSION,
      status: "active",
      resolutionMethod,
      totalGrossProceeds: trade.cashReceived,
      totalFees: 0,
      totalNetProceeds: trade.cashReceived,
      allocations,
      evidenceHash: trade.evidenceHash,
      completionSourceLogId: trade.completionSourceLogId,
      counterpartyId: trade.counterpartyId,
      transactionTimestamp: trade.timestamp,
      supersedesResolutionId: previous?.id ?? null,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: timestamp,
    };
    if (materiallyEqual(previous, resolution)) return { resolution: previous, created: false };
    const canonicalEvents = projectDisposalResolution(resolution);
    await this.repository.saveRevision(resolution, canonicalEvents, {
      previous,
      derivedVersions: { projection: ACCOUNTING_PROJECTION_VERSION, ledger: ACCOUNTING_LEDGER_VERSION, costLot: COST_LOT_VERSION, fifo: FIFO_VERSION, position: INVENTORY_POSITION_VERSION },
    });
    return { resolution, canonicalEvents, created: true };
  }
  history(sourceTransactionId){ return this.repository.historyForTransaction(sourceTransactionId); }
}

export const DisposalResolutions = new DisposalResolutionService();
