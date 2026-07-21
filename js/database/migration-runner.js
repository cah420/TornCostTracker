export async function applyMigrations(database, migrations = []){
  await database.transaction([`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`]);
  const appliedRows = await database.query("SELECT version FROM schema_migrations ORDER BY version");
  const applied = new Set(appliedRows.map((row) => Number(row.version)));
  const pending = [...migrations].sort((left, right) => left.version - right.version)
    .filter((migration) => !applied.has(migration.version));

  for (const migration of pending) {
    await database.transaction([
      ...migration.statements,
      {
        sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        bind: [migration.version, migration.name, Date.now()],
      },
    ]);
  }
  return { appliedVersions: pending.map((migration) => migration.version), schemaVersion: migrations.at(-1)?.version ?? 0 };
}
