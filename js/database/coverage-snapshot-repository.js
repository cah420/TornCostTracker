import { Database } from "./database-client.js";

/** Persists compact diagnostic progress only; no raw or canonical payload is duplicated. */
export class CoverageSnapshotRepository {
  constructor(database = Database){ this.database = database; }
  async save({ metrics, replay, createdAt = Date.now() }){
    await this.database.transaction([{ sql: "INSERT INTO coverage_snapshots (created_at, metrics_json, replay_json) VALUES (?, ?, ?)", bind: [createdAt, JSON.stringify(metrics), JSON.stringify(replay)] }]);
    return { createdAt, metrics, replay };
  }
  async list({ limit = 20 } = {}){
    const rows = await this.database.query("SELECT created_at, metrics_json, replay_json FROM coverage_snapshots ORDER BY created_at DESC LIMIT ?", [Math.max(1, Math.min(Number(limit) || 20, 100))]);
    return rows.map((row) => ({ createdAt: Number(row.created_at), metrics: JSON.parse(row.metrics_json), replay: JSON.parse(row.replay_json) }));
  }
}
