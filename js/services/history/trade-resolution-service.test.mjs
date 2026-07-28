import assert from "node:assert/strict";
import {
  TRADE_ACCOUNTING_POLICY_VERSION,
  TRADE_RESOLVER_VERSION,
  TradeResolutionService,
} from "./trade-resolution-service.js";

function evidence({ tradeId = "77", cash = 10_000, items = [{ id: 66, qty: 3, uid: null }], sentItems = [], cashReceived = 0, suffix = "" } = {}){
  const common = { eventTimestamp: 100, counterparties: [{ role: "trade_partner", entityType: "player", entityId: "5" }], attributes: { tradeId: Number(tradeId), correlationRequired: true }, sourceMetadata: {} };
  const movement = (item) => ({ direction: "transfer", resourceType: "item", resourceId: String(item.id), quantity: item.qty, attributes: item.uid ? { uid: String(item.uid) } : {} });
  return [
    { ...common, id: `complete${suffix}`, sourceLogId: `complete-log${suffix}`, parserName: "trade-completed-evidence", movements: [] },
    { ...common, id: `cash-out${suffix}`, sourceLogId: `cash-out-log${suffix}`, parserName: "trade-money-outgoing-evidence", movements: [{ direction: "transfer", resourceType: "cash", amount: cash, attributes: {} }] },
    { ...common, id: `items-in${suffix}`, sourceLogId: `items-in-log${suffix}`, parserName: "trade-items-incoming", movements: items.map(movement) },
    ...(sentItems.length ? [{ ...common, id: `items-out${suffix}`, sourceLogId: `items-out-log${suffix}`, parserName: "trade-items-outgoing-evidence", movements: sentItems.map(movement) }] : []),
    ...(cashReceived ? [{ ...common, id: `cash-in${suffix}`, sourceLogId: `cash-in-log${suffix}`, parserName: "trade-money-incoming-evidence", movements: [{ direction: "transfer", resourceType: "cash", amount: cashReceived, attributes: {} }] }] : []),
  ];
}
class MemoryRepository {
  constructor(events){ this.events = events; this.active = new Map(); this.histories = new Map(); this.canonical = new Map(); this.saved = 0; }
  async listEvidence(){ return structuredClone(this.events); }
  async activeForTrade(id){ return structuredClone(this.active.get(String(id)) ?? null); }
  async listActive(){ return structuredClone([...this.active.values()]); }
  async historyForTrade(id){ return structuredClone(this.histories.get(String(id)) ?? []); }
  async markNeedsReview(id){ const resolution = [...this.active.values()].find((entry) => entry.id === id); resolution.status = "needs_review"; }
  async saveRevision(resolution, events, { previous }){
    if (previous) { const stored = this.active.get(previous.tradeId); stored.status = "superseded"; stored.isActive = false; this.active.delete(previous.tradeId); }
    const copy = structuredClone(resolution); this.active.set(copy.tradeId, copy);
    const history = this.histories.get(copy.tradeId) ?? [];
    if (previous) {
      const index = history.findIndex((entry) => entry.id === previous.id);
      if (index >= 0) history[index] = structuredClone({ ...previous, status: "superseded", isActive: false });
    }
    history.unshift(copy); this.histories.set(copy.tradeId, history);
    this.canonical.set(copy.tradeId, structuredClone(events)); this.saved += 1;
  }
}

let now = 1_000;
const stackRepository = new MemoryRepository(evidence({ items: [{ id: 66, qty: 2, uid: null }, { id: 66, qty: 1, uid: null }] }));
const stackService = new TradeResolutionService({ repository: stackRepository, now: () => ++now });
const [automatic] = await stackService.resolveAutomaticCandidates();
assert.equal(automatic.created, true);
assert.equal(automatic.resolution.resolutionVersion, 1);
assert.equal(automatic.resolution.resolutionMethod, "automatic_single_item");
assert.equal(automatic.resolution.allocations[0].quantity, 3);
assert.equal(automatic.resolution.allocations[0].totalBasis, 10_000);
assert.equal(automatic.resolution.allocations[0].lots[0].quantity, 3);
assert.equal(automatic.canonicalEvents.length, 1);
assert.equal(automatic.canonicalEvents[0].attributes.tradeResolutionId, automatic.resolution.id);
assert.equal(automatic.canonicalEvents[0].attributes.resolutionVersion, 1);
assert.equal(automatic.canonicalEvents[0].movements.find((row) => row.resourceType === "cash").amount, 10_000);
const identical = await stackService.resolve("77", [{ itemId: "66", totalBasis: 10_000 }], "automatic_single_item");
assert.equal(identical.created, false);
assert.equal(stackRepository.saved, 1, "identical evidence creates no duplicate revision");

const uidRepository = new MemoryRepository(evidence({ items: [{ id: 9, qty: 1, uid: "30" }, { id: 9, qty: 1, uid: "10" }, { id: 9, qty: 1, uid: "20" }] }));
const uidService = new TradeResolutionService({ repository: uidRepository, now: () => ++now });
const [uids] = await uidService.resolveAutomaticCandidates();
assert.deepEqual(uids.resolution.allocations[0].lots.map((lot) => [lot.uid, lot.allocatedBasis]), [["10", 3334], ["20", 3333], ["30", 3333]]);
assert.equal(uids.canonicalEvents.length, 3);
assert.deepEqual(uids.canonicalEvents.map((event) => event.movements.find((row) => row.resourceType === "item").attributes.uid), ["10", "20", "30"]);

const multiRepository = new MemoryRepository(evidence({ cash: 100, items: [{ id: 1, qty: 2 }, { id: 2, qty: 3 }] }));
const multiService = new TradeResolutionService({ repository: multiRepository, now: () => ++now });
const dashboard = await multiService.dashboard();
assert.equal(dashboard.ready.length, 1); assert.equal(dashboard.summary.manualRequired, 1);
await assert.rejects(() => multiService.resolve("77", [{ itemId: "1", totalBasis: 50 }, { itemId: "2", totalBasis: 40 }]), /must equal cash sent/);
const firstManual = await multiService.resolve("77", [{ itemId: "1", totalBasis: 40 }, { itemId: "2", totalBasis: 60 }]);
assert.equal(firstManual.resolution.resolutionVersion, 1);
const secondManual = await multiService.resolve("77", [{ itemId: "1", totalBasis: 30 }, { itemId: "2", totalBasis: 70 }]);
assert.equal(secondManual.resolution.resolutionVersion, 2);
assert.equal(secondManual.resolution.supersedesResolutionId, firstManual.resolution.id);
const history = await multiService.history("77");
assert.equal(history.length, 2); assert.equal(history[0].isActive, true); assert.equal(history[1].status, "superseded");
assert.equal(multiRepository.canonical.get("77").every((event) => event.attributes.resolutionVersion === 2), true);
assert.deepEqual(await multiService.resolveAutomaticCandidates(), [], "automatic processing never replaces an active manual resolution");
assert.equal(multiRepository.saved, 2);

multiRepository.events = evidence({ cash: 101, items: [{ id: 1, qty: 2 }, { id: 2, qty: 3 }], suffix: "-changed" });
const changed = await multiService.dashboard();
assert.equal(changed.needsReview.length, 1);
assert.equal(changed.needsReview[0].resolutionVersion, 2, "changed evidence marks the active revision instead of silently replacing it");
assert.equal(multiRepository.saved, 2);
assert.equal(history[0].resolverVersion, TRADE_RESOLVER_VERSION);
assert.equal(history[0].accountingPolicyVersion, TRADE_ACCOUNTING_POLICY_VERSION);

const ineligibleRepository = new MemoryRepository(evidence({ sentItems: [{ id: 3, qty: 1 }] }));
assert.equal((await new TradeResolutionService({ repository: ineligibleRepository }).dashboard()).eligible.length, 0);
const receivedCashRepository = new MemoryRepository(evidence({ cashReceived: 1 }));
assert.equal((await new TradeResolutionService({ repository: receivedCashRepository }).dashboard()).eligible.length, 0);
console.log("Trade Resolution eligibility, allocation, versioning, and idempotency tests passed.");
