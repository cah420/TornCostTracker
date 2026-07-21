# Torn Cost Tracker

Torn Cost Tracker is an early desktop-style web application for tracking your currently owned Torn items and estimating the purchase cost of the units you still hold.

**Current version:** 0.7.3-alpha2 (the application reads its version from [version.json](version.json)).

This alpha is intended for player testing. Data is stored locally in your browser on the device where you run the application.

## What it currently does

- Connects to Torn using a limited-access API key.
- Downloads and combines owned items from Inventory, Bazaar, Display Case, and Item Market.
- Uses one ordered Torn API scheduler for item, catalog, profile, and purchase-log requests, targeting approximately 50 request starts per minute to leave room for normal gameplay and other tools.
- Shows each item's total quantity and populated locations.
- Caches owned items, the Torn item catalog, player profile, synchronization status, and snapshots locally.
- Imports purchase-related log history for a chosen 1-180 day period, then supports incremental purchase syncs.
- Recognizes Bazaar, Item Market, City Shop, Abroad Shop, and trade acquisitions where Torn log data permits.
- Provides sortable, searchable Items and Purchases tables.
- Includes an in-app Readme page sourced directly from this file.
- Supports a collapsible sidebar that remembers the preferred layout on this device.
- Estimates current-holdings cost basis using newest known purchases first, including partial lots.
- Separately reports quantity coverage and reliably priced coverage so unknown costs are not presented as zero.
- Distinguishes known cash cost, confirmed zero-cash cost, non-cash, and unresolved acquisition lots.
- Tracks verified inventory conversions through FIFO cost lots and shows current market, vendor-sell, and effective values separately.

## Getting started

1. Open **Settings**.
2. Select **Generate API Key** to create a limited-access Torn key with the permissions the app needs.
3. Paste the key and select **Save**. Your player profile should appear in the top-right status area.
4. Open **Items** and select **Refresh** to synchronize your owned items.
5. Open **Purchases** and choose the number of days of purchase history to import for the initial sync.
6. Select an item on the Items page, then open **Purchases** in Item Details to view its estimated cost basis.

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

## Known limitations

- **Bazaar availability:** Torn returns Bazaar contents only while your Bazaar is open. When it is closed or unavailable, the app retains the last cached Bazaar quantity rather than treating it as zero.
- **Cost basis is an estimate:** it matches current holdings against the newest imported acquisitions first. It cannot fully account for gifts, crimes, rewards, sales, item use, transfers, or purchases before the chosen import window.
- **Cash-cost scope:** zero-cost and non-cash are different. Only confirmed external free acquisitions may be recorded at $0; non-cash, conversion, and unresolved sources are not assigned a fabricated dollar value.
- **Unresolved trades:** multi-item trades with a combined cash amount are counted as acquired quantity, but their cost is intentionally shown as unknown unless Torn's log data supports a safe prior allocation.
- **Purchase history range:** the initial import is limited to 1-180 days. Older purchase history is not yet imported automatically.
- **Travel locations:** Abroad purchases use Torn's logged area mapping for Mexico, Hawaii, South Africa, Japan, China, Argentina, Switzerland, Canada, United Kingdom, UAE, and Cayman Islands.
- **Unique equipment:** weapons and armor are currently aggregated by their base item ID, so each Items row shows the correct combined quantity. Per-instance UID, stats, bonuses, and equipped-state details are deferred to a future feature.
- **Source verification:** Bazaar, Item Market, Abroad, existing City Shop matching, supported trades, and the exact `Faction give item receive` and `City item find` events are currently normalized. The verified faction gift and City Find are confirmed $0 cash acquisitions; faction loans, rewards, conversions, other gift types, and internal market/display movements are not imported until their directions and payloads are confirmed. City Shop title/payload variants remain deliberately narrow pending an independently captured sample.
- **Local-only storage:** clearing browser/site data, using a different browser/profile, or selecting either clear-cache action removes the corresponding local data. This alpha has no account or cloud backup.
- **Historical features:** snapshots are saved locally as a foundation for future reporting; portfolio charts, profit/loss, sale ingestion, and exact inventory accounting are not implemented yet.
- **Conversions:** only verified `Item use wallet` and `Item use empty blood bag` log shapes are currently mapped. Historical conversions before this ledger was introduced require a purchase-cache reset and a fresh initial history sync to be reconstructed.

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

Please do **not** include your API key in a report. If a Torn log is helpful, remove player-identifying information unless it is necessary to diagnose the issue.

## Project direction

The current architecture keeps Torn response parsing in importers, stores canonical owned items and acquisitions locally, and calculates derived cost basis separately. Planned work includes better synchronization resilience, unresolved-trade allocation, fuller historical reporting, portfolio growth, and market analysis.

For technical architecture details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For the detailed manual test checklist, see [TESTING.md](TESTING.md).
