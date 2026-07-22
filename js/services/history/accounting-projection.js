import { stableStringify } from "../raw-log-serialization.js";

export const ACCOUNTING_PROJECTION_VERSION = 1;
export const ProjectionOutcome = Object.freeze({ projectable: "projectable", neutral: "neutral", unresolved: "unresolved", ignored: "ignored", projectionError: "projection_error" });
export const AccountingClassification = Object.freeze({ paidAcquisition: "paid_acquisition", paidDisposal: "paid_disposal", nonCashAcquisition: "non_cash_acquisition", nonCashDisposal: "non_cash_disposal", conversion: "conversion", walletMovement: "wallet_movement", transferNeutral: "transfer_neutral", tradeUnresolved: "trade_unresolved", rewardNonCash: "reward_non_cash", cashReward: "cash_reward", unsupportedSemantics: "unsupported_semantics", ignoredSemantics: "ignored_semantics", projectionError: "projection_error" });
const outcomes = new Set(Object.values(ProjectionOutcome)); const classifications = new Set(Object.values(AccountingClassification));
const movementOrder = { item_in: 0, item_out: 1, cash_in: 2, cash_out: 3, wallet_in: 4, wallet_out: 5, neutral_item_in: 6, neutral_item_out: 7 };

export function accountingProjectionId(canonicalEventId, projectionVersion = ACCOUNTING_PROJECTION_VERSION){ return `projection:${projectionVersion}:${canonicalEventId}`; }
function fail(message){ throw new Error(message); }
function projectedMovement(movement, neutral = false){
  if (!movement || typeof movement !== "object") fail("Canonical movement is invalid.");
  const direction = String(movement.direction ?? ""); const resourceType = String(movement.resourceType ?? "");
  let category = null;
  if (resourceType === "item" && direction === "in") category = neutral ? "neutral_item_in" : "item_in";
  if (resourceType === "item" && direction === "out") category = neutral ? "neutral_item_out" : "item_out";
  if (resourceType === "cash" && direction === "in") category = "cash_in";
  if (resourceType === "cash" && direction === "out") category = "cash_out";
  if (!category) fail(`Unsupported canonical movement ${resourceType}/${direction}.`);
  const quantity = movement.quantity; const amount = movement.amount;
  if (category.includes("item") && (!Number.isFinite(quantity) || quantity <= 0 || !String(movement.resourceId ?? "").trim())) fail("Projected item movement requires a valid ID and positive quantity.");
  if (category.includes("cash") && (!Number.isFinite(amount) || amount < 0)) fail("Projected cash movement requires a finite nonnegative amount.");
  return { category, canonicalMovement: { resourceType, resourceId: movement.resourceId ?? null, direction, quantity: quantity ?? null, amount: amount ?? null, unit: movement.unit ?? null, role: movement.role ?? null, attributes: movement.attributes ?? {} } };
}
function has(movements, predicate){ return movements.some(predicate); }
function projectable(event, classification, movements, extras = {}){ return { outcome: ProjectionOutcome.projectable, classification, certainty: "structurally_verified", projectedMovements: movements, basisStatus: "not_applicable", proceedsStatus: "not_applicable", ...extras }; }
function unresolved(classification, reasonCode, detail, movements = []){ return { outcome: ProjectionOutcome.unresolved, classification, certainty: "unresolved", projectedMovements: movements, basisStatus: "unknown_basis", proceedsStatus: "unknown_proceeds", unresolvedReason: { code: reasonCode, detail } }; }

export function projectCanonicalEvent(event, { projectionVersion = ACCOUNTING_PROJECTION_VERSION } = {}){
  try {
    if (!event?.id || !Number.isFinite(event.eventTimestamp) || !event.eventType) fail("Canonical event envelope is invalid.");
    const canonicalMovements = Array.isArray(event.movements) ? event.movements : fail("Canonical event movements are invalid.");
    if (event.parserName === "trade") {
      const record = { id: accountingProjectionId(event.id, projectionVersion), canonicalEventId: event.id, canonicalEventVersion: event.schemaVersion, projectionVersion, canonicalEventType: event.eventType, eventTimestamp: event.eventTimestamp, participantMetadata: { actor: event.actor ?? null, counterparties: event.counterparties ?? [] }, sourceMetadata: { sourceLogId: event.sourceLogId ?? null, source: event.sourceMetadata ?? {} }, ...unresolved(AccountingClassification.tradeUnresolved, "trade_correlation_required", "Trade lifecycle evidence requires a correlated aggregate.", []) };
      validateProjection(record); return record;
    }
    const normal = canonicalMovements.map((movement) => projectedMovement(movement));
    let interpretation;
    if (event.eventType === "acquisition") {
      if (!has(normal, (m) => m.category === "item_in") || !has(normal, (m) => m.category === "cash_out")) fail("Paid acquisition requires item-in and cash-out movements.");
      interpretation = projectable(event, AccountingClassification.paidAcquisition, normal, { basisStatus: "known_total_consideration" });
    } else if (event.eventType === "disposal") {
      if (!has(normal, (m) => m.category === "item_out") || !has(normal, (m) => m.category === "cash_in")) fail("Paid disposal requires item-out and cash-in movements.");
      interpretation = projectable(event, AccountingClassification.paidDisposal, normal, { proceedsStatus: "known_total_proceeds" });
    } else if (event.eventType === "conversion") {
      if (event.parserName === "wallet") interpretation = projectable(event, AccountingClassification.walletMovement, normal, { basisStatus: "deferred_allocation" });
      else if (!has(normal, (m) => m.category === "item_out") || !(has(normal, (m) => m.category === "item_in") || has(normal, (m) => m.category === "cash_in"))) fail("Conversion requires verified input and output movements.");
      else interpretation = projectable(event, AccountingClassification.conversion, normal, { basisStatus: "deferred_allocation" });
    } else if (event.eventType === "reward") {
      if (!has(normal, (m) => m.category === "item_in" || m.category === "cash_in")) fail("Reward requires an incoming verified movement.");
      interpretation = has(normal, (m) => m.category === "cash_in") && !has(normal, (m) => m.category === "item_in")
        ? projectable(event, AccountingClassification.cashReward, normal, { basisStatus: "not_applicable" })
        : projectable(event, AccountingClassification.rewardNonCash, normal, { basisStatus: "known_no_cash_consideration" });
    } else if (event.eventType === "transfer") {
      const neutralMovements = canonicalMovements.map((movement) => projectedMovement(movement, true));
      interpretation = { outcome: ProjectionOutcome.neutral, classification: AccountingClassification.transferNeutral, certainty: "verified", projectedMovements: neutralMovements, basisStatus: "not_applicable", proceedsStatus: "not_applicable" };
    } else interpretation = unresolved(AccountingClassification.unsupportedSemantics, "unsupported_canonical_semantics", `No projection policy is registered for ${event.eventType}.`, normal);
    const projectedMovements = [...interpretation.projectedMovements].sort((left, right) => movementOrder[left.category] - movementOrder[right.category] || stableStringify(left).localeCompare(stableStringify(right)));
    const record = { id: accountingProjectionId(event.id, projectionVersion), canonicalEventId: event.id, canonicalEventVersion: event.schemaVersion, projectionVersion, canonicalEventType: event.eventType, eventTimestamp: event.eventTimestamp, participantMetadata: { actor: event.actor ?? null, counterparties: event.counterparties ?? [] }, sourceMetadata: { sourceLogId: event.sourceLogId ?? null, source: event.sourceMetadata ?? {} }, ...interpretation, projectedMovements };
    validateProjection(record); return record;
  } catch (error) {
    return { id: accountingProjectionId(event?.id ?? "invalid", projectionVersion), canonicalEventId: event?.id ?? null, canonicalEventVersion: event?.schemaVersion ?? null, projectionVersion, canonicalEventType: event?.eventType ?? "unknown", eventTimestamp: Number.isFinite(event?.eventTimestamp) ? event.eventTimestamp : 0, outcome: ProjectionOutcome.projectionError, classification: AccountingClassification.projectionError, certainty: "error", projectedMovements: [], basisStatus: "unknown_basis", proceedsStatus: "unknown_proceeds", projectionError: { detail: error.message }, sourceMetadata: { sourceLogId: event?.sourceLogId ?? null } };
  }
}
export function validateProjection(record){
  if (!record.canonicalEventId || !outcomes.has(record.outcome) || !classifications.has(record.classification)) fail("Projection has an invalid identity, outcome, or classification.");
  if (record.outcome === ProjectionOutcome.projectionError && !record.projectionError?.detail) fail("Projection errors require a reason.");
  if (record.outcome === ProjectionOutcome.unresolved && !record.unresolvedReason?.code) fail("Unresolved projections require a reason code.");
  if (record.classification === AccountingClassification.transferNeutral && record.outcome !== ProjectionOutcome.neutral) fail("Transfers must remain neutral.");
  if (record.classification === AccountingClassification.tradeUnresolved && record.outcome !== ProjectionOutcome.unresolved) fail("Trades must remain unresolved.");
  record.projectedMovements.forEach((movement) => { if (!Object.hasOwn(movementOrder, movement.category)) fail("Projection contains an invalid movement category."); });
}
