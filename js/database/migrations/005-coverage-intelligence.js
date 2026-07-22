/** Compact diagnostics snapshots; raw logs and canonical events are never copied here. */
export const migration005CoverageIntelligence = {
  version: 5,
  name: "coverage_intelligence",
  statements: [
    `CREATE TABLE coverage_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      metrics_json TEXT NOT NULL,
      replay_json TEXT NOT NULL
    )`,
    "CREATE INDEX idx_coverage_snapshots_created ON coverage_snapshots(created_at DESC)",
  ],
};
