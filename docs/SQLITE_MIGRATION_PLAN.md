# SQLite Migration Plan

## Decision

Use the official SQLite 3.53.3 WASM bundle in an application-owned dedicated module worker. The worker opens the database through SQLite's `opfs-sahpool` VFS and exposes a deliberately small application RPC (`query`, `transaction`, `export`, and lifecycle operations). Application services will call repositories, never SQL or the worker directly.

This choice keeps the application deployable as a static SPA. SQLite documents `opfs-sahpool` as the appropriate OPFS VFS when COOP/COEP headers are unavailable; GitHub Pages cannot configure those headers. It uses worker-only OPFS access, which is appropriate for database I/O and avoids blocking the UI. SQLite's bundled Worker1/Promiser interface is intentionally not used because it is deprecated and its asynchronous message semantics make transaction boundaries fragile. See [SQLite persistence options](https://sqlite.org/wasm/doc/tip/persistence.md), [SQLite WASM overview](https://sqlite.org/wasm/doc/tip/about.md), and [worker API status](https://sqlite.org/wasm/doc/tip/api-worker1.md).

## Repository audit

Current canonical LocalStorage domains are:

| Domain | Current module/key family | Migration phase |
| --- | --- | --- |
| Player/settings | `stores/player.js`, `settings.js` | Keep LocalStorage initially |
| Owned items/sync state | `stores/items.js`, `item-sync-service.js` | Later compatibility repository |
| Purchase acquisitions/checkpoints | `stores/purchases.js` | Phase 2–4 |
| Conversion ledger | `stores/inventory-ledger.js` | Phase 4 |
| Market values/catalog | `stores/market-values.js`, `stores/item-catalog.js` | Phase 4 |
| Snapshots | `stores/history.js` | Later historical migration |
| UI preferences/sort state | sidebar/DataGrid | Remain LocalStorage |

No existing store has been removed or redirected. The active application continues using LocalStorage adapters while SQLite is initialized only as dormant infrastructure.

## Phase 1 foundation

```
js/database/
  database-client.js       worker lifecycle and serialized RPC client
  sqlite-worker.js         official SQLite WASM + OPFS VFS boundary
  migration-runner.js      numbered, repeatable migration executor
  migrations/              ordered schema-only migration modules
  repository-contracts.js  service-facing persistence contracts
  database-diagnostics.js  startup capability/fallback state
```

The worker owns SQL, `BEGIN IMMEDIATE` transaction batches, `PRAGMA foreign_keys = ON`, and database export. The first migration creates `schema_migrations` and `application_metadata`. It is repeatable and idempotent. Failed initialization records diagnostics and leaves the working LocalStorage stores active.

## Planned schema

All money is integer cents; all timestamps are UTC integer milliseconds or Torn's documented Unix seconds, named explicitly per column. Raw Torn payload JSON is immutable and separate from derived data.

| Table | Key constraints/indexes | Purpose |
| --- | --- | --- |
| `schema_migrations` | primary key `version` | Repeatable schema version history |
| `application_metadata` | primary key `key` | Database/app metadata |
| `raw_logs` | unique `(player_id, source_log_id)`, indexes on player/timestamp/type | Immutable Torn source records and normalized index fields |
| `sync_checkpoints` | primary key `(player_id, domain)` | Resumable incremental imports |
| `parser_versions` | primary key `parser_version` | Auditable parser/replay versions |
| `accounting_events` | deterministic event ID, player/timestamp indexes | Replayable normalized event stream |
| `items` | primary key `item_id` | Torn item reference data |
| `item_value_observations` | item/timestamp index | Market, vendor sell, and effective values |
| `acquisitions` / `acquisition_lines` | source-log unique index | Derived acquisition records |
| `cost_lots` / `lot_consumptions` | lot/event foreign keys, open-lot index | FIFO and later disposal accounting |
| `conversions` / `conversion_outputs` | source-event unique index | Immutable conversion allocations/snapshots |
| `inventory_movements` | player/item/timestamp index | Future source-location movement history |
| `reconciliation_adjustments` | event foreign key | Explicit non-inferred corrections |
| `settings` | primary key `key` | Future non-secret database settings |

## Migration sequence

1. Bootstrap worker, OPFS capability detection, migration runner, diagnostics, and export plumbing.
2. Add append-only `raw_logs`, import runs, conflict diagnostics, and sync checkpoints. This is complete: the user-triggered SQLite archive importer is independent from LocalStorage purchase synchronization.
3. Offer an explicit LocalStorage-to-SQLite copy with counts, checksums, validation report, and no source deletion.
4. Migrate acquisitions, lots, conversions, and valuation observations behind repository interfaces.
5. Add parser versions, accounting events, chronological replay, unresolved/ignored/failed event states.
6. Make SQLite repositories the default only after export/import, migration validation, and rollback testing pass. LocalStorage cleanup remains a separate explicit user action.

## Compatibility and risks

- OPFS requires a secure context and worker support. Chromium-based browsers, Firefox 111+, and Safari 16.4+ provide the necessary API family; SQLite documents Safari versions below 17 as incompatible with its standard `opfs` VFS, supporting the `opfs-sahpool` choice.
- Private/incognito modes and browser quota eviction can reduce durability. Startup must report database availability; export/import is the user-controlled backup path.
- `opfs-sahpool` favors performance/static-host compatibility over unrestricted multi-tab concurrency. The application will document a single active tab recommendation and later add an advisory Web Lock/BroadcastChannel guard.
- GitHub Pages cannot emit COOP/COEP headers, so the header-dependent standard `opfs` VFS and custom WASMFS build are not the primary deployment path.
- Database initialization and migrations must be awaited before a SQLite repository is selected. Until then the LocalStorage implementation remains authoritative.

## Raw log warehouse (Sprint 10.2)

`Torn API -> RawLogImportService -> RawLogRepository -> immutable SQLite raw_logs`

This is an archive-only path. It does not call `PurchaseLogImporter`, create an acquisition, update a lot, invoke FIFO, or write any LocalStorage accounting key. The existing PurchaseSyncService remains the production accounting path.

Migration 002 adds `raw_logs` (one row per unique Torn `source_log_id`, canonical full JSON, indexed source timestamp/type/category/title, SHA-256 and observation timestamps), `log_import_runs` (durable status/counters/boundaries/errors), `sync_checkpoints` (per-stream/direction cursor and run), and `raw_log_conflicts` (changed-payload evidence). Torn event timestamps are stored as Unix seconds; import timestamps are UTC epoch milliseconds.

Raw JSON uses recursive sorted-key serialization; arrays retain source order, absent fields remain absent, and `null` remains `null`. SHA-256 via Web Crypto covers that complete individual source object. A matching source ID/hash updates only `last_seen_at`; a changed source ID/hash writes a conflict record and never overwrites the original payload.

Historical imports are started only from Settings. They request newest-to-oldest pages, prefer Torn continuation links, and commit every batch with its checkpoint. Timestamp fallback deliberately overlaps the oldest boundary and source-ID uniqueness absorbs duplicates. The checkpoint includes timestamp, stable source-ID tie-breaker data, configured boundary, and continuation metadata. Incremental sync starts at the newest archived timestamp with the same overlap. Pause/cancel apply after the active page commits; refresh-detected running imports become paused. No precise completion percentage is claimed where Torn does not provide a total.

Torn bounds this endpoint to 100 records, so the configurable archive page/batch size defaults to 100 and every complete API page is one `BEGIN IMMEDIATE` transaction. A failed page rolls back raw inserts, conflicts, metrics, and checkpoint together; its continuation is therefore never advanced past an uncommitted page tail. The `opfs-sahpool` database name is an absolute virtual path (`/torn-cost-tracker.sqlite3`), as required by that VFS. Its pool reserves six file slots non-destructively for the database, journal/WAL, and temporary files; this also expands an earlier undersized pool. Future `ParserRegistry` contracts remain detached from import: schema version, parser version, and ledger/projection version are distinct concerns.

## Canonical event framework (Sprint 10.3)

Migration 003 adds generic derived-data tables: `canonical_events` and `processing_state`. Raw logs remain immutable evidence. A canonical event has a deterministic ID, source log ID, timestamp, broad event type, parser name/version, canonical schema version, generic participants, generic resource movements, attributes, and selected source metadata. The full Torn JSON remains only in `raw_logs`.

The versioned `ParserRegistry` is the new interpretation boundary for the SQLite archive. Its verified Wallet and Blood Bag parsers describe conversions as generic item/cash movements; they do not create acquisitions, lots, conversion-ledger records, or cost calculations. Repeated parser replay is idempotent through deterministic IDs. A parser version upgrade can generate a distinct derived result for the same raw log, while schema changes remain explicit migrations. Unsupported and error outcomes are durable processing-state records, not discarded logs.

Replay is user-triggered from Settings, reads raw logs chronologically with a timestamp/source-ID cursor, and has no accounting side effects. The existing LocalStorage purchase importer and FIFO/conversion engine continue to parse and operate independently until a later, separately validated accounting migration.

## Temporary raw-log developer export

Settings can create a local `raw-log-jsonl` developer export from the OPFS archive because OPFS is intentionally not exposed as a normal workspace file. The export metadata line identifies the format/version, creation time, redaction mode, filters, ordering, and matching count. Each subsequent `raw_log` line includes source ID, indexed source fields, optional observation hashes/timestamps, and the complete original object under `raw`.

The default is redacted. A per-export deterministic pseudonym map masks likely user/faction identifiers and obvious secret, token, free-text, email, and URL fields while preserving structural mechanics fields. This is not guaranteed complete privacy protection. Full raw output requires confirmation. Both variants are read-only, local downloads; neither reads settings/API keys nor mutates `raw_logs`, parser state, checkpoints, or canonical events. Exports page through repository queries, but Blob creation remains memory-bound for very large files. This temporary developer tool may later be superseded by formal backup/export features.

## Core inventory canonical coverage (Sprint 10.4)

The observed approximately eight-day archive validates parsers for City Shop purchase (4200), Bazaar purchase (1225), Item Market purchase (1112), trade lifecycle/offer (4401/4420/4482), crime item/cash rewards (9020/9015), Faction item receive (6733), and City item find (7011), alongside earlier Wallet/Blood Bag conversions. Coverage uses payload field signatures and representative raw samples only; future history can reveal additional variants. Unsupported variants remain processing-state results rather than being inferred. The Settings coverage report measures only imported archive type/title groups and is never a claim of complete Torn coverage.

## Testing strategy

- Deterministic migration-runner tests verify ordering and repeatability.
- Worker integration tests will cover OPFS open, foreign keys, transaction rollback, export/import, and a reopened database when supported by the browser test environment.
- Repository contract tests run against fake, LocalStorage, and SQLite adapters.
- Import tests verify raw-log source-ID deduplication, resumable checkpoints, and idempotent replay.
- Accounting tests verify integer-cent allocations, FIFO ties, immutable snapshots, unresolved states, and transaction rollback.
- Manual matrix: Chrome/Edge, Firefox, Safari 17+, unsupported/OPFS-disabled fallback, private browsing, reload/reopen, two-tab behavior, export/import, and failed migration recovery.
