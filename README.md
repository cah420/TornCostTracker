# Torn Cost Tracker

Torn Cost Tracker is an early desktop-style web application for tracking your currently owned Torn items and estimating the purchase cost of the units you still hold.

**Current version:** 0.8.0-alpha1 (the application reads its version from [version.json](version.json)).

This alpha is intended for player testing. Data is stored locally in your browser on the device where you run the application.

SQLite migration work has begun behind the existing LocalStorage implementation. Current player data and app behavior remain LocalStorage-backed while the new browser-database layer is validated.

## What it currently does

- Connects to Torn using a limited-access API key.
- Downloads and combines owned items from Inventory, Bazaar, Display Case, and Item Market.
- Uses one ordered Torn API scheduler for item, catalog, profile, and purchase-log requests, targeting approximately 50 request starts per minute to leave room for normal gameplay and other tools.
- Shows each item's total quantity and populated locations.
- Caches owned items, the Torn item catalog, player profile, synchronization status, and snapshots locally.
- Imports purchase-related log history for a chosen 1-180 day period, then supports incremental purchase syncs.
- Recognizes Bazaar, Item Market, City Shop, Abroad Shop, and trade acquisitions where Torn log data permits.
- Recognizes verified Faction Gift and City Find zero-cash acquisitions.
- Records verified wallet and empty-blood-bag inventory conversions with FIFO lot consumption and immutable accounting snapshots.
- Provides sortable, searchable Items and Purchases tables.
- Provides a newest-first Conversion History table with historical basis, received value, and informational value difference.
- Includes an in-app Readme page sourced directly from this file.
- Supports a collapsible sidebar that remembers the preferred layout on this device.
- Estimates current-holdings cost basis using newest known purchases first, including partial lots.
- Separately reports quantity coverage and reliably priced coverage so unknown costs are not presented as zero.
- Distinguishes known cash cost, confirmed zero-cash cost, non-cash, and unresolved acquisition lots.
- Tracks verified inventory conversions through FIFO cost lots and shows current market, vendor-sell, and effective values separately.
- Offers an optional Settings-based SQLite Raw Log Archive for immutable Torn log evidence, with historical import, incremental sync, pause/resume, duplicate detection, and conflict diagnostics. It does not yet alter accounting.
- Includes an optional canonical-event replay layer for archived logs. Its initial Wallet and Blood Bag parsers create generic derived movements for future analytics; it does not alter current accounting.
- Canonical parser coverage now includes observed City Shop, current and legacy Bazaar, Abroad Shop, Item Market, trade-offer, crime reward, Faction item receive, and City item find logs. Legacy Bazaar (1220) and Abroad Shop (4201) remain marked partial until full archived signature coverage is verified. This is based on supplied archive evidence, not all Torn mechanics.
- Canonical conversion coverage includes verified grenade-box (2350), medical-supply-box (2360), and stash-box (2407) transformations. They record consumed/created resources only and remain partial until full archived signature coverage is verified.
- Canonical disposal coverage includes verified Item Market, Bazaar, and Item Shop cash-sale logs (1104, 1113, 1221, 1226, 4210). These describe item-out/cash-in movements only; they do not calculate profit, fees, or cost basis and remain partial until full archived signature coverage is verified.
- Canonical transfer coverage includes verified Item receive (legacy), Item send, and Item receive logs (4101, 4102, 4103). These describe only item movement and known counterparties; they never create purchases, sales, cash cost, FIFO, or accounting entries.
- Canonical acquisition coverage includes the verified legacy Item Market buy shape (1103): one item row with quantity one, seller, and total cost. Multi-row or multi-unit legacy purchases remain unsupported until their cost-allocation meaning is independently verified.
- Settings includes a developer-facing Project Health and Coverage Intelligence panel. It reports archive records, parser/signature coverage, parser families, replay snapshots, and high-impact unsupported types; it is read-only and does not change accounting.
- Settings also includes a developer-facing Accounting Projection rebuild. It interprets canonical events into a separate, deterministic, read-only future-ledger foundation; it does not alter active Purchases, FIFO, cost lots, valuation, or inventory behavior.
- Settings includes a developer-facing Accounting Ledger rebuild. It consumes stored projections only, uses balanced double-entry cash postings where evidence permits, and preserves deferred allocations, neutral transfers, and unresolved trades without changing active application accounting.
- Includes a refreshable Torn Log Type Catalog and coverage diagnostics that identify which archived log types are supported, awaiting samples, ignored, legacy, or need parser work. These diagnostics do not alter accounting.
- Provides a developer-only, read-only JSONL export of filtered archived raw logs, with redacted output by default and a confirmation gate for full raw output.

## Getting started

1. Open **Settings**.
2. Select **Generate API Key** to create a limited-access Torn key with the permissions the app needs.
3. Paste the key and select **Save**. Your player profile should appear in the top-right status area.
4. Open **Items** and select **Refresh** to synchronize your owned items.
5. Open **Purchases** and choose the number of days of purchase history to import for the initial sync.
6. Select an item on the Items page, then open **Purchases** in Item Details to view its estimated cost basis.
7. Optionally use **Settings → Raw Log Archive** to archive log history locally for future analysis. This is separate from Purchases and does not account, reconcile, or cost the archived logs.

Your API key is saved only in local browser storage on your device. Do not share it, screenshots containing it, or browser-storage exports with anyone.

## Helpful things to test

- Item quantities in every location, especially items held in more than one place.
- Items that exist only in Bazaar, Display Case, or Item Market.
- Items-grid sorting, searching, row selection, and selected-row highlighting.
- Purchase imports for Bazaar, Item Market, City Shop, Abroad, and trades.
- Purchases search by item name, source, seller/counterparty, trade ID, acquisition ID, or date.
- Cost-basis results for items with known recent purchases, partial lots, and trades.
- Reloading the app to confirm cached player, item, and purchase information behaves as expected.
- The confirmation safeguards for clearing the item or purchase cache in Settings.
- Wallet and empty-blood-bag conversions, including their Conversion History values and any unresolved-history explanation.

## Known limitations

- **Bazaar availability:** Torn returns Bazaar contents only while your Bazaar is open. When it is closed or unavailable, the app retains the last cached Bazaar quantity rather than treating it as zero.
- **Cost basis is an estimate:** it matches current holdings against the newest imported acquisitions first. It cannot fully account for gifts, crimes, rewards, sales, item use, transfers, or purchases before the chosen import window.
- **Cash-cost scope:** zero-cost and non-cash are different. Only confirmed external free acquisitions may be recorded at $0; non-cash, conversion, and unresolved sources are not assigned a fabricated dollar value.
- **Unresolved trades:** multi-item trades with a combined cash amount are counted as acquired quantity, but their cost is intentionally shown as unknown unless Torn's log data supports a safe prior allocation.
- **Purchase history range:** the initial import is limited to 1-180 days. Older purchase history is not yet imported automatically.
- **Raw Log Archive:** SQLite archive availability depends on a secure browser context with Worker and OPFS support. If unavailable, all current LocalStorage features remain usable. The archive may be large and is local/private to this browser; use one active app tab while importing. Archived logs are source evidence only, not parsed accounting records.
- **Canonical Events:** parser replay is a developer-facing, derived-data feature. Unsupported logs are retained and marked as unsupported; replay does not yet make archived activity affect Purchases, FIFO, conversions, or cost basis.
- **Accounting Projection:** this is a separate, rebuildable interpretation layer. Transfers remain neutral and incomplete trades remain unresolved. It has no FIFO, lot matching, cost-basis, profit/loss, tax, or valuation behavior.
- **Accounting Ledger:** this separate diagnostic layer is not authoritative accounting. It has no cost lots, FIFO, valuation, profit/loss, tax treatment, or item-level allocation for multi-item consideration. Deferred and unresolved entries intentionally remain visible rather than receiving guessed amounts.
- **Transfer Events:** only the verified `4101` `item,message,quantity,sender`, `4102` `items,message,receiver`, and `4103` `items,message,sender` payload signatures are supported. Other transfer-like logs and variants remain unsupported until their exact direction and fields are verified.
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

The current architecture keeps Torn response parsing in importers, stores canonical owned items and acquisitions locally, and calculates derived cost basis separately. Planned work includes better synchronization resilience, unresolved-trade allocation, fuller historical reporting, portfolio growth, and market analysis.

For technical architecture details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For the detailed manual test checklist, see [TESTING.md](TESTING.md).
