function uidExact(demand, eligibleLots){ const candidates = eligibleLots.filter((lot) => lot.itemUid === demand.itemUid); if (candidates.length > 1) throw new Error("ambiguous_specific_item_identity"); return { candidates, policyCode: "uid-exact", unresolvedReason: null }; }
function fungible(demand, eligibleLots){ if (eligibleLots.some((lot) => lot.itemUid)) return { candidates: [], policyCode: "fungible-fifo", unresolvedReason: "outgoing_uid_missing" }; return { candidates: eligibleLots.filter((lot) => !lot.itemUid), policyCode: "fungible-fifo", unresolvedReason: null }; }
export const FIFO_MATCHING_POLICY_REGISTRY = Object.freeze([
  { code: "uid-exact", applies: (demand) => Boolean(demand.itemUid), select: uidExact },
  { code: "fungible-fifo", applies: () => true, select: fungible },
]);
export function selectFifoCandidates(demand, eligibleLots){ const policy = FIFO_MATCHING_POLICY_REGISTRY.find((candidate) => candidate.applies(demand)); if (!policy) throw new Error("unknown_fifo_policy"); return policy.select(demand, eligibleLots); }
