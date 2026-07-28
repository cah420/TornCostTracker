# Accounting Specification

## Disposal Accounting v1

Disposal accounting follows `raw evidence → contract parser → canonical event → Projection → Ledger → FIFO → Realized Results → Inventory Position`. Parsers never edit Cost Lots, FIFO, or Inventory Position.

Paid sales record known net proceeds. Item Market log 1113 proves `cost_each × quantity = cost_total + fee`; gross and fee remain on canonical evidence, while realized result uses `cost_total` as net proceeds. Unknown proceeds are never converted to zero.

Consumption, gifts/donations, and loss/destruction are `non_cash_disposal` events with known-zero proceeds. They consume FIFO basis but create no revenue and no realized sales gain/loss. Conversion inputs are excluded from ordinary disposal FIFO. Transfers do not consume basis.

FIFO allocates basis and attributable net proceeds deterministically with integer cumulative allocation. Realized Results are complete only when allocated proceeds and consumed basis are both known. Insufficient historical quantity, missing UIDs, and unknown basis remain explicit exceptions.

The policy expansion increments Projection to v3, Ledger to v3, Cost Lots to v3, FIFO to v3, and Inventory Position to v2. Migration 012 marks that complete chain stale so pre-disposal derived records cannot be mistaken for current output.

See [DISPOSAL_LOG_SUPPORT.md](DISPOSAL_LOG_SUPPORT.md) for the contract matrix and unobserved candidates.

## Trade Resolution v1

Trade Resolution is an audited accounting source between correlated canonical trade evidence and paid acquisition events:

`Raw Logs -> Canonical Trade Evidence -> Trade Resolution -> Canonical Acquisitions -> Projection -> Ledger -> Cost Lots -> FIFO -> Inventory Position`

The resolver never writes Ledger, Cost Lot, FIFO, or Inventory Position records.

### Eligible trade boundary

Version 1 resolves only completed trades where the player sent a positive cash amount, sent no items, received one or more items, and received no cash.

Properties, companies, factions, treaties, item-for-item exchanges, cash received, items sent, and mixed-direction trades are outside v1. Terminal evidence uses verified log IDs 4430, 4440, 4441, 4445, and 4446. Offer/edit lifecycle records do not establish completion.

### Automatic resolution

Received evidence is grouped by canonical Torn item ID before automatic eligibility is decided. Multiple JSON or UID rows for one item ID are one item group.

One unique item ID uses `automatic_single_item`:

- total basis equals cash sent;
- quantity equals the group quantity;
- stackable items create one allocation lot;
- UID items create one allocation lot per UID;
- UID order is deterministic ascending identifier order;
- each UID receives `floor(total basis / UID count)`;
- the first `total basis % UID count` ordered UIDs receive one additional dollar.

Thus a $10,000 basis over three ordered UIDs is allocated as $3,334, $3,333, and $3,333 on every replay.

### Manual resolution

Two or more unique item IDs require `manual_multi_item`. Every received item ID must appear exactly once and allocated totals must equal cash sent. The UI links allocated-total and unit-basis inputs, but the persisted integer allocated total is authoritative. No balanced resolution means no acquisition events.

### Revision and audit policy

Each trade has one stable business key and monotonically increasing immutable revisions. A revision records its schema, resolver, accounting-policy, evidence hash, method, allocations, UID allocation order, basis, source completion log, and immediate predecessor.

Only one revision can be active. Editing creates a new revision, transactionally supersedes the old revision, replaces its canonical acquisitions, and invalidates the current derived accounting chain. Raw evidence and superseded revisions are never deleted. Identical evidence and allocations are idempotent. Changed evidence marks the active resolution `needs_review`; confirmed manual resolutions are never silently regenerated.

### Rebuild policy

Activating a resolution invalidates current Projection, Ledger, Cost Lot, FIFO, and Inventory Position rows in the same transaction as revision activation and canonical replacement. Rebuild those layers in dependency order. This prevents an edited allocation from coexisting with obsolete Cost Lots or FIFO matches.
