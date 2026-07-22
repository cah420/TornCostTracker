import assert from "node:assert/strict";
import { AccountingLedgerService } from "./accounting-ledger-service.js";

const projection = { id: "projection:1:one", projectionVersion: 1, canonicalEventId: "canonical:one", canonicalEventType: "acquisition", eventTimestamp: 1, classification: "paid_acquisition", outcome: "projectable", projectedMovements: [{ category: "item_in", canonicalMovement: { resourceId: "1", quantity: 1, direction: "in", attributes: {} } }, { category: "cash_out", canonicalMovement: { amount: 50, direction: "out" } }], sourceMetadata: {} };
class ProjectionMemory { async pageForLedger(_version, { timestamp }) { return timestamp === null ? [{ id: projection.id, event_timestamp: 1, projection_payload_json: JSON.stringify(projection) }] : []; } }
class LedgerMemory {
  constructor(){ this.transactions = new Map(); this.lines = new Map(); this.run = null; }
  async seedAccounts(){ } async startRun(){ this.run = { id: 1 }; return this.run; } async finishRun(_id, { status, metrics }){ this.run = { ...this.run, status, metrics }; }
  async storeBatch(transactions){ let transactionsInserted = 0; let existingTransactions = 0; let linesInserted = 0; let existingLines = 0; transactions.forEach((transaction) => { if (this.transactions.has(transaction.id)) existingTransactions += 1; else { this.transactions.set(transaction.id, transaction); transactionsInserted += 1; } transaction.lines.forEach((line) => { if (this.lines.has(line.id)) existingLines += 1; else { this.lines.set(line.id, line); linesInserted += 1; } }); }); return { transactionsInserted, existingTransactions, linesInserted, existingLines }; }
  async countRows(){ return { transactions: this.transactions.size, lines: this.lines.size }; } async latestRun(){ return this.run; } async listAccounts(){ return []; } async accountBalances(){ return []; }
}
const ledger = new LedgerMemory(); const service = new AccountingLedgerService({ projections: new ProjectionMemory(), ledger, pageSize: 1 });
const first = await service.rebuild(); const second = await service.rebuild();
assert.equal(first.projectionsExamined, 1); assert.equal(first.transactionsInserted, 1); assert.equal(first.reconciliationBalanced, true);
assert.equal(second.transactionsInserted, 0); assert.equal(second.existingTransactions, 1); assert.equal(second.reconciliationBalanced, true);
assert.equal(ledger.transactions.size, 1); assert.equal(ledger.lines.size, 2);
console.log("accounting-ledger service tests passed");
