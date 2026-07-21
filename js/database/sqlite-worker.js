import sqlite3InitModule from "../../assets/vendor/sqlite/sqlite3.mjs";

let sqlite3 = null;
let database = null;

function rowsFor(sql, bind = []){
  const rows = [];
  database.exec({ sql, bind, rowMode: "object", callback: (row) => rows.push(row) });
  return rows;
}

function execute(statements = []){
  database.exec("BEGIN IMMEDIATE");
  try {
    statements.forEach((statement) => database.exec({ sql: statement.sql ?? statement, bind: statement.bind ?? [] }));
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* Preserve the original error. */ }
    throw error;
  }
}

async function initialize(){
  if (database) return { vfs: "opfs-sahpool", sqliteVersion: sqlite3.version.libVersion };
  sqlite3 = await sqlite3InitModule({
    locateFile: (file) => new URL(`../../assets/vendor/sqlite/${file}`, import.meta.url).href,
    print: () => {},
    printErr: (...args) => console.warn("SQLite WASM:", ...args),
  });
  // A pool needs capacity for the main database plus journal/WAL and possible
  // temporary files. SQLite's documented default is six; reserve it as well
  // so an earlier undersized persisted pool is expanded non-destructively.
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "tct-opfs-sahpool", initialCapacity: 6, verbosity: 0 });
  await pool.reserveMinimumCapacity(6);
  // opfs-sahpool requires an absolute virtual path. Relative paths can
  // surface as SQLITE_CANTOPEN even after the VFS itself installs correctly.
  database = new pool.OpfsSAHPoolDb("/torn-cost-tracker.sqlite3");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA locking_mode = EXCLUSIVE");
  database.exec("PRAGMA journal_mode = WAL");
  return { vfs: "opfs-sahpool", sqliteVersion: sqlite3.version.libVersion };
}

self.onmessage = async ({ data }) => {
  const { id, operation, payload = {} } = data;
  try {
    let result;
    if (operation === "initialize") result = await initialize();
    else if (operation === "query") result = rowsFor(payload.sql, payload.bind);
    else if (operation === "transaction") result = execute(payload.statements);
    else if (operation === "export") result = database.export();
    else if (operation === "close") { database?.close(); database = null; result = null; }
    else throw new Error(`Unknown database worker operation: ${operation}`);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: { message: error.message, name: error.name } });
  }
};
