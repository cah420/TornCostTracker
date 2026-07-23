function paidDisposal(transaction, tools){
  if (transaction.transactionStatus !== "posted" || transaction.balanceStatus !== "balanced" || transaction.debitTotal !== transaction.creditTotal) throw new Error("unsupported_ledger_shape");
  return { demands: tools.createDisposalDemands(transaction), disposition: null };
}
export const FIFO_SOURCE_POLICY_REGISTRY = Object.freeze([
  { code: "ledger-error", applies: (t) => t.transactionStatus === "ledger_error", build: (t, tools) => ({ demands: [], disposition: tools.fifoDisposition(t, tools.FifoDisposition.error, "source_ledger_error") }) },
  { code: "paid-disposal", applies: (t) => t.accountingClassification === "paid_disposal", build: paidDisposal },
  { code: "trade-unresolved", applies: (t) => t.accountingClassification === "trade_unresolved", build: (t, tools) => ({ demands: [], disposition: tools.fifoDisposition(t, tools.FifoDisposition.unresolved, "trade_correlation_required") }) },
  { code: "neutral-transfer", applies: (t) => t.accountingClassification === "transfer_neutral", build: (t, tools) => ({ demands: [], disposition: tools.fifoDisposition(t, tools.FifoDisposition.ineligible, "neutral_transfer") }) },
  { code: "conversion-input", applies: (t) => t.accountingClassification === "conversion", build: (t, tools) => ({ demands: [], disposition: tools.fifoDisposition(t, tools.FifoDisposition.ineligible, "conversion_input_not_supported") }) },
  { code: "no-disposal-demand", applies: () => true, build: (t, tools) => ({ demands: [], disposition: tools.fifoDisposition(t, tools.FifoDisposition.noDemand, "source_has_no_supported_disposal_demand") }) },
]);
