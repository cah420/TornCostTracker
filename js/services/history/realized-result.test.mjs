import assert from "node:assert/strict";
import { buildRealizedResult } from "./realized-result.js";

const base = { id: "c1", fifoVersion: 2, sourceDisposalCanonicalEventId: "event", sourceLotId: "lot", itemId: "1", itemUid: null, consumedQuantity: 2, allocatedDisposalProceeds: 100, consumedAllocatedBasis: 70, disposalTimestamp: 10, disposalType: "sale" };
assert.deepEqual({ result: buildRealizedResult(base).realizedResult, status: buildRealizedResult(base).resultStatus }, { result: 30, status: "complete" });
assert.equal(buildRealizedResult({ ...base, consumedAllocatedBasis: null }).realizedResult, null);
assert.equal(buildRealizedResult({ ...base, consumedAllocatedBasis: null }).resultStatus, "incomplete_basis");
const gift = buildRealizedResult({ ...base, allocatedDisposalProceeds: 0, disposalType: "gift_or_donation" });
assert.equal(gift.realizedResult, null); assert.equal(gift.resultStatus, "basis_consumed_non_sale");
const partial = buildRealizedResult({ ...base, disposalDemandStatus: "partially_matched", unmatchedDisposalQuantity: 1 });
assert.equal(partial.realizedResult, null); assert.equal(partial.resultStatus, "incomplete_quantity");
console.log("Realized Results preserve sales results without labeling non-sales as losses.");
