import assert from "node:assert/strict";
import { DisposalResolutionService } from "./disposal-resolution-service.js";

function evidence({ tradeId = "88", cash = 10_000, items = [{ id: 9, qty: 3, uid: null }], receivedItems = [], cashSent = 0, completed = true, suffix = "" } = {}){
  const common = { eventTimestamp: 200, counterparties: [{ role: "trade_partner", entityType: "player", entityId: "7" }], attributes: { tradeId: Number(tradeId), correlationRequired: true }, sourceMetadata: {} };
  const itemMovement = (item) => ({ direction: "transfer", resourceType: "item", resourceId: String(item.id), quantity: item.qty, attributes: item.uid ? { uid: String(item.uid) } : {} });
  return [
    ...(completed ? [{ ...common, id: `complete${suffix}`, sourceLogId: `complete-log${suffix}`, parserName: "trade-completed-evidence", movements: [] }] : []),
    { ...common, id: `cash-in${suffix}`, sourceLogId: `cash-in-log${suffix}`, parserName: "trade-money-incoming-evidence", movements: [{ direction: "transfer", resourceType: "cash", amount: cash, attributes: {} }] },
    { ...common, id: `items-out${suffix}`, sourceLogId: `items-out-log${suffix}`, parserName: "trade-items-outgoing-evidence", movements: items.map(itemMovement) },
    ...(receivedItems.length ? [{ ...common, id: `items-in${suffix}`, sourceLogId: `items-in-log${suffix}`, parserName: "trade-items-incoming", movements: receivedItems.map(itemMovement) }] : []),
    ...(cashSent ? [{ ...common, id: `cash-out${suffix}`, sourceLogId: `cash-out-log${suffix}`, parserName: "trade-money-outgoing-evidence", movements: [{ direction: "transfer", resourceType: "cash", amount: cashSent, attributes: {} }] }] : []),
  ];
}
class MemoryRepository {
  constructor(events){ this.events = events; this.active = new Map(); this.histories = new Map(); this.saved = 0; }
  async listEvidence(){ return structuredClone(this.events); }
  async activeForTransaction(id){ return structuredClone(this.active.get(String(id)) ?? null); }
  async listActive(){ return structuredClone([...this.active.values()]); }
  async historyForTransaction(id){ return structuredClone(this.histories.get(String(id)) ?? []); }
  async markNeedsReview(id){ const row = [...this.active.values()].find((entry) => entry.id === id); row.status = "needs_review"; }
  async saveRevision(resolution, canonicalEvents, { previous }){
    if (previous) { const row = this.active.get(previous.sourceTransactionId); row.status = "superseded"; row.isActive = false; }
    const copy = structuredClone(resolution); this.active.set(copy.sourceTransactionId, copy);
    const history = this.histories.get(copy.sourceTransactionId) ?? [];
    if (previous) { const index = history.findIndex((row) => row.id === previous.id); if (index >= 0) history[index] = { ...structuredClone(previous), status: "superseded", isActive: false }; }
    history.unshift(copy); this.histories.set(copy.sourceTransactionId, history); this.canonicalEvents = structuredClone(canonicalEvents); this.saved += 1;
  }
}

let now = 1000;
const stackRepository = new MemoryRepository(evidence({ items: [{ id: 9, qty: 2 }, { id: 9, qty: 1 }] }));
const stackService = new DisposalResolutionService({ repository: stackRepository, now: () => ++now });
const [automatic] = await stackService.resolveAutomaticCandidates();
assert.equal(automatic.resolution.resolutionVersion, 1);
assert.equal(automatic.resolution.allocations[0].quantity, 3);
assert.equal(automatic.canonicalEvents[0].eventType, "disposal");
assert.equal(automatic.canonicalEvents[0].movements.find((row) => row.resourceType === "cash").amount, 10_000);
assert.equal((await stackService.resolve("88", [{ itemId: "9", totalProceeds: 10_000 }], "automatic_single_item")).created, false);
assert.equal(stackRepository.saved, 1);

const uidRepository = new MemoryRepository(evidence({ items: [{ id: 9, qty: 1, uid: "30" }, { id: 9, qty: 1, uid: "10" }, { id: 9, qty: 1, uid: "20" }] }));
const [uids] = await new DisposalResolutionService({ repository: uidRepository, now: () => ++now }).resolveAutomaticCandidates();
assert.deepEqual(uids.resolution.allocations[0].lots.map((lot) => [lot.uid, lot.allocatedProceeds]), [["10", 3334], ["20", 3333], ["30", 3333]]);

const multiRepository = new MemoryRepository(evidence({ cash: 100, items: [{ id: 1, qty: 2 }, { id: 2, qty: 1 }] }));
const multiService = new DisposalResolutionService({ repository: multiRepository, now: () => ++now });
assert.equal((await multiService.dashboard()).ready.length, 1);
await assert.rejects(() => multiService.resolve("88", [{ itemId: "1", totalProceeds: 40 }, { itemId: "2", totalProceeds: 50 }]), /must equal cash received/);
const v1 = await multiService.resolve("88", [{ itemId: "1", totalProceeds: 40 }, { itemId: "2", totalProceeds: 60 }]);
const v2 = await multiService.resolve("88", [{ itemId: "1", totalProceeds: 30 }, { itemId: "2", totalProceeds: 70 }]);
assert.equal(v2.resolution.resolutionVersion, 2); assert.equal(v2.resolution.supersedesResolutionId, v1.resolution.id);
const history = await multiService.history("88"); assert.equal(history.length, 2); assert.equal(history[1].status, "superseded");
multiRepository.events = evidence({ cash: 101, items: [{ id: 1, qty: 2 }, { id: 2, qty: 1 }], suffix: "-changed" });
assert.equal((await multiService.dashboard()).needsReview.length, 1);
assert.equal(multiRepository.saved, 2);

for (const events of [evidence({ receivedItems: [{ id: 4, qty: 1 }] }), evidence({ cashSent: 1 }), evidence({ completed: false })]) {
  assert.equal((await new DisposalResolutionService({ repository: new MemoryRepository(events) }).dashboard()).eligible.length, 0);
}
const conflictingIds = evidence().map((event, index) => ({ ...event, attributes: { ...event.attributes, opaqueTradeId: index === 0 ? "opaque-a" : "opaque-b" } }));
assert.equal((await new DisposalResolutionService({ repository: new MemoryRepository(conflictingIds) }).dashboard()).eligible.length, 0, "conflicting opaque trade IDs cannot correlate");
console.log("Disposal Resolution eligibility, deterministic allocation, versioning, and idempotency tests passed.");
