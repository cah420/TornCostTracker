# Torn Cost Tracker

Torn Cost Tracker is an early desktop-style web application for tracking your currently owned Torn items and estimating the purchase cost of the units you still hold.

**Current version:** 0.10.0-alpha1 (the application reads its version from [version.json](version.json)). Version 1.0.0 remains reserved for complete SQLite-backed user-facing feature parity.

This alpha is intended for player testing. Data is stored locally in your browser on the device where you run the application.

The Purchases experience is now the first application-facing SQLite accounting consumer. Item synchronization and several compatibility workflows still use local browser storage while their migrations continue.

## What it currently does

- Connects to Torn using a limited-access API key.
- Downloads and combines owned items from Inventory, Bazaar, Display Case, and Item Market.
- Uses one ordered Torn API scheduler for item, catalog, profile, and purchase-log requests, targeting approximately 50 request starts per minute to leave room for normal gameplay and other tools.
- Shows each item's total quantity and populated locations.
- Caches owned items, the Torn item catalog, player profile, synchronization status, and snapshots locally.
- Archives Torn logs in SQLite and rebuilds deterministic accounting layers through Inventory Position v1.
- Recognizes Bazaar, Item Market, City Shop, Abroad Shop, and trade acquisitions where Torn log data permits.
- Recognizes verified Faction Gift and City Find zero-cash acquisitions.
- Records verified wallet and empty-blood-bag inventory conversions with FIFO lot consumption and immutable accounting snapshots.
- Provides sortable, searchable Items and SQLite-backed Purchases position tables with health, status, basis, and identity filters.
- Provides a newest-first Conversion History table with historical basis, received value, and informational value difference.
- Includes an in-app Readme page sourced directly from this file.
- Supports a collapsible sidebar that remembers the preferred layout on this device.
- Displays remaining Cost Lots and immutable FIFO consumption history for each fungible or UID-specific position.
- Separately reports safely known remaining basis and complete remaining basis so incomplete totals are never presented as complete.
- Distinguishes known cash cost, confirmed zero-cash cost, non-cash, and unresolved acquisition lots.
- Tracks verified inventory conversions through FIFO cost lots and shows current market, vendor-sell, and effective values separately.
- Offers an optional Settings-based SQLite Raw Log Archive for immutable Torn log evidence, with historical import, incremental sync, pause/resume, duplicate detection, and conflict diagnostics. It does not yet alter accounting.
- Includes an optional canonical-event replay layer for archived logs. Its initial Wallet and Blood Bag parsers create generic derived movements for future analytics; it does not alter current accounting.
- Canonical parser coverage now includes observed City Shop, current and legacy Bazaar, Abroad Shop, Item Market, trade-offer, crime reward, Faction item receive, and City item find logs. Legacy Bazaar (1220) and Abroad Shop (4201) remain marked partial until full archived signature coverage is verified. This is based on supplied archive evidence, not all Torn mechanics.
- Canonical conversion coverage includes verified grenade-box (2350), medical-supply-box (2360), and stash-box (2407) transformations. They record consumed/created resources only and remain partial until full archived signature coverage is verified.
- Canonical disposal coverage includes verified Item Market, Bazaar, and Item Shop cash-sale logs (1104, 1113, 1221, 1226, 4210). These describe item-out/cash-in movements only; they do not calculate profit, fees, or cost basis and remain partial until full archived signature coverage is verified.
- Canonical movement coverage treats verified Item receive logs (4101/4103) as zero-cash gifts that create supply, while Item send (4102) remains a neutral outbound transfer.
- Canonical acquisition coverage includes the verified legacy Item Market buy shape (1103): one item row with quantity one, seller, and total cost. Multi-row or multi-unit legacy purchases remain unsupported until their cost-allocation meaning is independently verified.
- Settings includes a developer-facing Project Health and Coverage Intelligence panel. It reports archive records, parser/signature coverage, parser families, replay snapshots, and high-impact unsupported types; it is read-only and does not change accounting.
- Settings also includes a developer-facing Accounting Projection rebuild. It interprets canonical events into a separate, deterministic, read-only future-ledger foundation; it does not alter active Purchases, FIFO, cost lots, valuation, or inventory behavior.
- Settings includes a developer-facing Accounting Ledger rebuild. It consumes stored projections only, uses balanced double-entry cash postings where evidence permits, and preserves deferred allocations, neutral transfers, and unresolved trades without changing active application accounting.
- Settings includes a developer-facing Cost Lot rebuild over the Accounting Ledger. It creates deterministic acquisition groups and full-remaining-quantity lots, while shared purchase basis, reward basis, and conversion basis remain explicitly deferred where they cannot be allocated safely.
- Settings includes a developer-facing FIFO Consumption rebuild. Verified paid disposals become immutable demand and lot-allocation records with causal chronological matching, partial-lot support, exact UID safeguards, and explicit historical shortfalls. Original Cost Lots are never changed.
- Settings includes an Inventory Position rebuild over immutable Cost Lots and FIFO Consumptions. Purchases reads this projection through a read-only query service while keeping fungible items and individual UIDs separate.
- Includes a refreshable Torn Log Type Catalog and coverage diagnostics that identify which archived log types are supported, awaiting samples, ignored, legacy, or need parser work. These diagnostics do not alter accounting.
- Provides a developer-only, read-only JSONL export of filtered archived raw logs, with redacted output by default and a confirmation gate for full raw output.

## Getting started

1. Open **Settings**.
2. Select **Generate API Key** to create a limited-access Torn key with the permissions the app needs.
3. Paste the key and select **Save**. Your player profile should appear in the top-right status area.
4. Open **Items** and select **Refresh** to synchronize your owned items.
5. Use **Settings → Raw Log Archive** to import evidence, then rebuild Canonical Events, Projection, Ledger, Cost Lots, FIFO, and Inventory Positions in order.
6. Open **Purchases** to browse remaining accounting positions and inspect Cost Lots and FIFO consumption history.
7. Select an item on the Items page and open its **Purchases** tab for a compact SQLite position summary.

Your API key is saved only in local browser storage on your device. Do not share it, screenshots containing it, or browser-storage exports with anyone.

## Helpful things to test

- Item quantities in every location, especially items held in more than one place.
- Items that exist only in Bazaar, Display Case, or Item Market.
- Items-grid sorting, searching, row selection, and selected-row highlighting.
- Purchases search by catalog name, item ID, or UID, plus health/status/basis/identity filters and paging.
- Position details for untouched, partially consumed, multi-lot, free, deferred, and unknown-basis evidence.
- Current Torn quantity comparisons, especially for UID items and items with multiple accounting identities.
- Reloading the app to confirm cached player, item, and purchase information behaves as expected.
- The confirmation safeguards for clearing the item or purchase cache in Settings.
- Wallet and empty-blood-bag conversions, including their Conversion History values and any unresolved-history explanation.

## Known limitations

- **Bazaar availability:** Torn returns Bazaar contents only while your Bazaar is open. When it is closed or unavailable, the app retains the last cached Bazaar quantity rather than treating it as zero.
- **Purchases is historical accounting, not live inventory:** Inventory Position is derived from archived evidence. The separately displayed current Torn quantity is informational and is not written into accounting.
- **Cash-cost scope:** zero-cost and non-cash are different. Only confirmed external free acquisitions may be recorded at $0; non-cash, conversion, and unresolved sources are not assigned a fabricated dollar value.
- **Unresolved trades:** multi-item trades with a combined cash amount are counted as acquired quantity, but their cost is intentionally shown as unknown unless Torn's log data supports a safe prior allocation.
- **Archive completeness:** missing historical evidence can produce shortfalls, deferred basis, unknown basis, or a difference from current Torn quantity.
- **Raw Log Archive:** SQLite archive availability depends on a secure browser context with Worker and OPFS support. If unavailable, all current LocalStorage features remain usable. The archive may be large and is local/private to this browser; use one active app tab while importing. Archived logs are source evidence only, not parsed accounting records.
- **Canonical Events:** parser replay is a developer-facing, derived-data feature. Unsupported logs are retained and marked as unsupported; replay does not yet make archived activity affect Purchases, FIFO, conversions, or cost basis.
- **Accounting Projection:** this is a separate, rebuildable interpretation layer. Transfers remain neutral and incomplete trades remain unresolved. It has no FIFO, lot matching, cost-basis, profit/loss, tax, or valuation behavior.
- **Accounting Ledger:** this separate diagnostic layer is not authoritative accounting. It has no FIFO, valuation, profit/loss, or tax treatment. Deferred and unresolved entries intentionally remain visible rather than receiving guessed amounts.
- **Cost Lot Foundation:** these SQLite lots are rebuildable developer data and do not replace the existing LocalStorage cost lots or current calculations. Every new lot remains entirely unconsumed. Multi-item payments, rewards, and conversion outputs retain deferred or unknown basis; no disposal matching, FIFO consumption, gain/loss, or valuation is performed.
- **FIFO Consumption Engine:** this SQLite FIFO layer is diagnostic and non-authoritative. It currently consumes only verified paid-disposal demand; conversion inputs, item usage, gifts sent, correlated trades, and other exits remain unsupported. Historical archive gaps and missing outgoing UIDs may leave demand unmatched or unresolved. It does not calculate COGS, realized gain/loss, valuation, or current inventory.
- **Inventory Position Projection:** this SQLite projection is rebuildable historical accounting state, not authoritative live inventory. It now drives Purchases, but not Items or valuation. WARNING positions can reflect deferred/unknown basis, archived acquisition gaps, or UID ambiguity. Catalog names are display-only and fall back to `Item #ID`.
- **Known versus complete basis:** known remaining basis is the safely attributable portion. Complete remaining basis is shown only when every remaining unit has known basis. Weighted average uses known remaining basis divided by known remaining quantity.
- **UID positions:** individual UID positions are never merged with fungible positions. Item-level unmatched evidence is shown separately and is not assigned to a UID without proof.
- **Legacy purchase cache:** Purchases and its Item Details tab no longer read LocalStorage acquisition records or legacy cost-basis lots. Compatibility code may remain temporarily for Conversion History, status, and cache-management workflows.
- **Position classification:** `UNKNOWN` means remaining quantity itself is indeterminate; it does not mean “known quantity with incomplete basis.” Health reports projection integrity separately from historical limitations, while confidence and the explanation object identify attributable evidence gaps. The normative rules are documented in [docs/INVENTORY_POSITION_CLASSIFICATION.md](docs/INVENTORY_POSITION_CLASSIFICATION.md).
- **Gift and Transfer Events:** verified 4101/4103 receipts create zero-cash gift supply; verified 4102 sends remain neutral. Other transfer-like logs and variants remain unsupported until their exact direction and fields are verified.
- **Legacy Item Market purchases:** `1103` is accepted only for the exact `cost,item,seller` structure with one item row and quantity one. The Settings Project Health profile reports the complete local archive's accepted and rejected population; multi-item or multi-unit variants are not assigned a guessed cost allocation.
- **Log-type coverage:** catalog coverage combines Torn's current reference catalog with this browser's archived samples. Awaiting Sample means no local evidence is archived; Supported means only observed payload variants are handled, not every possible Torn variant.
- **Developer exports:** Raw Log Developer Export downloads local JSONL files only. It never exports application settings or the saved API key, but full raw logs can contain private activity. Redaction is helpful rather than perfect—review a file before sharing it.
- **Travel locations:** Abroad purchases use Torn's logged area mapping for Mexico, Hawaii, South Africa, Japan, China, Argentina, Switzerland, Canada, United Kingdom, UAE, and Cayman Islands.
- **Unique equipment:** weapons and armor are currently aggregated by their base item ID, so each Items row shows the correct combined quantity. Per-instance UID, stats, bonuses, and equipped-state details are deferred to a future feature.
- **Source verification:** Bazaar, Item Market, Abroad, existing City Shop matching, supported trades, and the exact `Faction give item receive` and `City item find` events are currently normalized. The verified faction gift and City Find are confirmed $0 cash acquisitions; faction loans, rewards, conversions, other gift types, and internal market/display movements are not imported until their directions and payloads are confirmed. City Shop title/payload variants remain deliberately narrow pending an independently captured sample.
- **Local-only storage:** clearing browser/site data, using a different browser/profile, or selecting either clear-cache action removes the corresponding local data. This alpha has no account or cloud backup.
- **Historical features:** snapshots are saved locally as a foundation for future reporting; portfolio charts, profit/loss, sale ingestion, and exact inventory accounting are not implemented yet.
- **Conversions:** only verified `Item use wallet` and `Item use empty blood bag` log shapes are currently mapped. A conversion whose input item has no tracked acquisition history is retained as unresolved rather than receiving an invented $0 basis. Historical conversions before this ledger was introduced require a purchase-cache reset and a fresh initial history sync to be reconstructed.

## Please report

Feedback is most useful when it includes the expected result, actual result, and the steps that led to it. In particular, please report:

- Missing items, incorrect names, locations, or quantities.
- Bazaar behavior when open versus closed.
- Purchases that are missing, duplicated, mislabelled, or assigned the wrong item/quantity/cost.
- Incorrect Abroad country labels; include the Torn log's `area` value and the correct country if you can.
- Cost-basis results that look incorrect. Include the item, current quantity, relevant purchase dates/amounts, and whether any units came from non-purchase sources.
- Search, sort, selection, layout, mobile/desktop display, or accessibility issues.
- API-key validation, synchronization, or cache-clear errors.
- Any Torn rate-limit message encountered during ordinary synchronization, including the action being run and approximate time.
- Torn Log Type Catalog refresh/diff results, unexpected catalog titles, or a redacted sample for an Unsupported Observed or Parser Error entry.

Please do **not** include your API key in a report. If a Torn log is helpful, remove player-identifying information unless it is necessary to diagnose the issue.

## Project direction

The historical accounting path is now `Raw Logs → Canonical Events → Projection → Ledger → Cost Lots → FIFO → Inventory Position → Purchases Query Service`. Current owned-item synchronization remains modular and separate. Planned work includes migrating remaining legacy consumers, valuation, fuller reporting, portfolio growth, and market analysis.

For technical architecture details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For the detailed manual test checklist, see [TESTING.md](TESTING.md).
