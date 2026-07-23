/** Ordered, projection-only policy registry.  Policies never inspect raw logs or canonical events. */
function monetaryLine(accountCode, debitAmount, creditAmount, movementDirection = null){ return { accountCode, debitAmount, creditAmount, itemId: null, itemUid: null, quantity: null, movementDirection, lineKind: "monetary" }; }
function conversionPolicy(projection, { transaction, memoLines, LedgerAccounts, LedgerStatus }){
  const cashLines = projection.projectedMovements.filter((entry) => entry.category === "cash_in" || entry.category === "cash_out").flatMap((entry) => {
    const amount = entry.canonicalMovement.amount;
    return entry.category === "cash_in" ? [monetaryLine(LedgerAccounts.cashWallet, amount, null, "in"), monetaryLine(LedgerAccounts.conversion, null, amount)] : [monetaryLine(LedgerAccounts.conversion, amount, null), monetaryLine(LedgerAccounts.cashWallet, null, amount, "out")];
  });
  const itemLines = [...memoLines(projection, LedgerAccounts.conversion, "item_in"), ...memoLines(projection, LedgerAccounts.conversion, "item_out")];
  return transaction(projection, projection.classification === "conversion" ? "conversion" : "wallet", cashLines.length ? LedgerStatus.posted : LedgerStatus.deferred, [...cashLines, ...itemLines], { allocationStatus: "deferred", deferredReason: "allocation_deferred" });
}
export const LEDGER_POLICY_REGISTRY = Object.freeze([
  { code: "projection-error", applies: (p) => p.outcome === "projection_error", build: (p, { transaction, LedgerStatus }) => transaction(p, "projection-error", LedgerStatus.error, [], { diagnostic: p.projectionError }) },
  { code: "paid-acquisition", applies: (p) => p.classification === "paid_acquisition", build: (p, { postedWithItems, cashAmount, LedgerAccounts }) => postedWithItems(p, "paid-acquisition", LedgerAccounts.inventory, LedgerAccounts.cashWallet, cashAmount(p, "cash_out"), "item_in", { basisStatus: p.basisStatus }) },
  { code: "paid-disposal", applies: (p) => p.classification === "paid_disposal", build: (p, { postedWithItems, cashAmount, LedgerAccounts }) => postedWithItems(p, "paid-disposal", LedgerAccounts.cashWallet, LedgerAccounts.saleProceeds, cashAmount(p, "cash_in"), "item_out", { proceedsStatus: p.proceedsStatus }) },
  { code: "cash-reward", applies: (p) => p.classification === "cash_reward", build: (p, { transaction, cashAmount, LedgerAccounts, LedgerStatus }) => { const amount = cashAmount(p, "cash_in"); return transaction(p, "cash-reward", LedgerStatus.posted, [monetaryLine(LedgerAccounts.cashWallet, amount, null, "in"), monetaryLine(LedgerAccounts.cashReward, null, amount)]); } },
  { code: "non-cash-acquisition", applies: (p) => p.classification === "non_cash_acquisition", build: (p, { transaction, memoLines, LedgerAccounts, LedgerStatus }) => transaction(p, "non-cash-acquisition", LedgerStatus.deferred, memoLines(p, LedgerAccounts.inventory, "item_in"), { basisStatus: p.basisStatus, deferredReason: "non_cash_consideration_not_valued" }) },
  { code: "non-cash-reward", applies: (p) => p.classification === "reward_non_cash", build: (p, { transaction, memoLines, LedgerAccounts, LedgerStatus }) => transaction(p, "non-cash-reward", LedgerStatus.deferred, memoLines(p, LedgerAccounts.rewardInventory, "item_in"), { basisStatus: p.basisStatus, deferredReason: p.basisStatus === "known_no_cash_consideration" ? null : "basis_unknown" }) },
  { code: "transfer-neutral", applies: (p) => p.classification === "transfer_neutral", build: (p, { transaction, memoLines, LedgerAccounts, LedgerStatus }) => transaction(p, "transfer-neutral", LedgerStatus.memorandum, [...memoLines(p, LedgerAccounts.neutralTransfer, "neutral_item_in"), ...memoLines(p, LedgerAccounts.neutralTransfer, "neutral_item_out")]) },
  { code: "trade-unresolved", applies: (p) => p.classification === "trade_unresolved", build: (p, { transaction, LedgerStatus }) => transaction(p, "trade-unresolved", LedgerStatus.unresolved, [], { unresolvedReason: p.unresolvedReason }) },
  { code: "conversion-or-wallet", applies: (p) => p.classification === "conversion" || p.classification === "wallet_movement", build: conversionPolicy },
]);
