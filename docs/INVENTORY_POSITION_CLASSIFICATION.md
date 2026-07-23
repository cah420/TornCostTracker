# Inventory Position Classification Matrix

This document is the normative semantic specification for Inventory Position v1. Any future change to Position status, health, confidence, reason codes, or explanation semantics must update this matrix in the same change.

Position classification communicates three independent concepts:

- **Status** describes the state of the projected remaining inventory.
- **Health** describes projection integrity, not archive completeness.
- **Confidence** estimates accounting-evidence completeness from 0–100; it is not a correctness score.

## Authoritative matrix

| Trigger condition | Status | Health | Confidence impact | Diagnostic/reason code | Human-readable explanation | Rationale |
|---|---|---|---:|---|---|---|
| Quantity, basis, lots, and sources reconcile with no limitations | `NORMAL` | `HEALTHY` | None; 100 | `fully_reconciled` | Inventory is internally reconciled with no identified accounting limitation. | Complete evidence should not be penalized. |
| One or more source lots are partly consumed, with otherwise complete evidence | `PARTIAL` | `HEALTHY` | None; 100 | `partial_lot` | Remaining inventory includes partially consumed lots. | Partial consumption is normal inventory state, not uncertainty. |
| Remaining quantity includes safely known but unallocated shared basis | `DEFERRED` | `WARNING` | Proportional 1–15 | `deferred_basis` | Remaining quantity is known, but some consideration cannot yet be allocated safely. | Quantity is known; only basis allocation is deferred. |
| Remaining quantity includes basis that is not safely known | `DEFERRED` | `WARNING` | Proportional 1–25 | `unknown_basis` | Remaining quantity is known, but some cash basis is unknown. | Unknown basis is not unknown inventory. |
| Attributable FIFO demand has an historical acquisition shortfall | Existing inventory status | `WARNING` | Proportional 1–15 | `historical_shortfall` | Archived acquisitions do not fully cover the attributable disposal demand. | This limits historical completeness without invalidating derived remaining quantity. |
| Exact Position identity has unresolved UID evidence | Existing inventory status | `WARNING` | 10 | `uid_ambiguity` | Specific item identity cannot be fully reconstructed. | Identity evidence is incomplete, but projection arithmetic remains sound. UID-less item evidence is not copied to every UID Position. |
| Remaining quantity itself is explicitly indeterminate | `UNKNOWN` | `WARNING` | 40 | `quantity_indeterminate` | Remaining inventory quantity cannot be determined. | `UNKNOWN` is reserved exclusively for unknown inventory quantity. Current v1 source math does not normally produce this condition. |
| Remaining quantity or basis is negative | `NEGATIVE` | `UNHEALTHY` | Confidence becomes 0 | `negative_remaining_quantity`, `negative_remaining_basis` | Projection contains an impossible negative value. | Impossible arithmetic is an integrity failure. |
| Quantity, basis, identity, source, or reconciliation validation fails | `ERROR` | `UNHEALTHY` | Confidence becomes 0 | Relevant integrity diagnostic | Projection integrity failed and requires investigation. | Broken invariants must never be presented as historical uncertainty. |

## Status precedence

When multiple conditions apply, status is selected in this order:

1. `NEGATIVE`
2. `ERROR`
3. `UNKNOWN`
4. `DEFERRED`
5. `PARTIAL`
6. `NORMAL`

Historical shortfall and UID ambiguity do not replace an otherwise valid inventory status. They appear in Health, Confidence, and Explanation instead. A Position may therefore be `PARTIAL / WARNING`, `NORMAL / WARNING`, or `DEFERRED / WARNING`.

## Health rules

- `HEALTHY`: all projection invariants pass and no attributable historical, identity, or basis limitation exists.
- `WARNING`: all projection invariants pass, but at least one attributable limitation exists.
- `UNHEALTHY`: impossible arithmetic, conflicting identity, missing source, failed reconciliation, or another projection-integrity error exists.

Health never becomes `UNHEALTHY` merely because the archive is incomplete.

## Confidence deductions

Confidence begins at 100. Deductions are deterministic and additive, bounded to 0–100:

- `deferredBasis`: `ceil(15 × deferred remaining quantity / total remaining quantity)`, minimum 1 when present.
- `unknownBasis`: `ceil(25 × unknown-basis remaining quantity / total remaining quantity)`, minimum 1 when present.
- `historicalShortfall`: `ceil(15 × shortfall / (remaining quantity + shortfall))`, minimum 1 when present.
- `uidAmbiguity`: 10 when attributable to the exact Position identity.
- `quantityIndeterminate`: 40.
- `projectionError`: 100.

Deferred and unknown quantities are mutually exclusive lot categories. Historical evidence without a matching Position identity is reported as unassigned evidence in Project Health and does not reduce every UID Position for the same item.

## Explanation contract

Every persisted Position contains an `explanation` object with:

- status value, reason codes, and summary;
- health value, reason codes, and summary;
- confidence value, named deductions, and summary;
- structured reasons with category, message, and supporting quantity/count;
- a separate warning-reason list for aggregate histograms.

Explanation fields are semantic metadata. They do not participate in quantity, basis, identity, or reconciliation calculations.

## Integrity diagnostic codes

The following codes are controlled projection-integrity diagnostics or guarded rebuild failures:

- `negative_remaining_quantity`
- `negative_remaining_basis`
- `remaining_exceeds_original`
- `consumed_exceeds_original`
- `basis_reconciliation_failure`
- `quantity_reconciliation_failure`
- `missing_source_lot`
- `missing_fifo_consumption`
- `missing_position_identity`
- `duplicate_position_identity`
- `duplicate_source_lot`
- `uid_identity_conflict`
- `confidence_calculation_failure`
- `unsupported_position_status`
- `unsupported_position_health`
- `unknown_projection_version`
- `unknown_fifo_version`
- `unknown_cost_lot_version`
- `unknown_ledger_version`

Warning reason codes (`deferred_basis`, `unknown_basis`, `historical_shortfall`, `uid_ambiguity`, and `quantity_indeterminate`) are explanation metadata, not integrity failures.

## RC1 calibration rationale

The initial live rebuild produced 46,138 `UNKNOWN` and 46,139 `WARNING` Positions despite zero diagnostics and complete global reconciliation. Two original rules inflated those classifications:

1. unknown basis, historical shortfall, or UID ambiguity forced `UNKNOWN`, even though remaining quantity was known;
2. UID-less historical evidence was copied to every UID Position for an item.

RC1 removes both conflations. It does not change Position identity, lot aggregation, original/consumed/remaining quantity, basis calculation, persistence, or reconciliation. The post-calibration occurrence and combination histograms are generated by the next deterministic browser rebuild rather than inferred from the pre-calibration aggregate totals.
