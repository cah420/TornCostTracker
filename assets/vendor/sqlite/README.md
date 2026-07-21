# SQLite WASM vendor record

- Source: [SQLite official download page](https://www.sqlite.org/download.html)
- Bundle: `sqlite-wasm-3530300.zip` (SQLite 3.53.3)
- SHA3-256: `cae64fe0107faf041a1af2dbf544699ae49af71976a15819ad7639bfedce7dcf`
- Included runtime files: `sqlite3.mjs`, `sqlite3.wasm`, and `sqlite3-opfs-async-proxy.js`.

The application uses its own worker protocol and does not use SQLite's deprecated Worker1/Promiser wrappers.
