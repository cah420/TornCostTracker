export const migration001Bootstrap = {
  version: 1,
  name: "bootstrap_metadata",
  statements: [
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS application_metadata (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ],
};
