import { DatabaseDiagnostics } from "./database-diagnostics.js";
import { applyMigrations } from "./migration-runner.js";
import { DATABASE_MIGRATIONS } from "./migrations/index.js";

function supported(){
  return typeof Worker !== "undefined" && typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory);
}

export class DatabaseClient {
  constructor({ workerFactory = null } = {}){
    this.workerFactory = workerFactory ?? (() => new Worker(new URL("./sqlite-worker.js", import.meta.url), { type: "module" }));
    this.worker = null;
    this.nextId = 1;
    this.pending = new Map();
    this.initializing = null;
    this.readyResult = null;
  }

  async initialize(){
    if (this.readyResult?.available && this.worker) return this.readyResult;
    if (this.initializing) return this.initializing;
    this.initializing = this.start();
    try { return await this.initializing; }
    finally { this.initializing = null; }
  }

  async start(){
    if (!supported()) {
      const result = { available: false, reason: "OPFS or Worker support is unavailable; LocalStorage compatibility storage remains active." };
      DatabaseDiagnostics.set({ status: "unavailable", persistence: "localStorage", lastError: result.reason });
      return result;
    }
    try {
      this.worker = this.workerFactory();
      this.worker.onmessage = ({ data }) => this.resolve(data);
      this.worker.onerror = (event) => this.rejectAll(new Error(event.message || "SQLite worker failed."));
      const details = await this.request("initialize");
      const migration = await applyMigrations(this, DATABASE_MIGRATIONS);
      DatabaseDiagnostics.set({ status: "ready", persistence: "sqlite", lastError: null, ...details, ...migration });
      this.readyResult = { available: true, ...details, ...migration };
      return this.readyResult;
    } catch (error) {
      this.close();
      DatabaseDiagnostics.set({ status: "unavailable", persistence: "localStorage", lastError: error.message });
      return { available: false, reason: error.message };
    }
  }

  request(operation, payload = {}){
    if (!this.worker) return Promise.reject(new Error("SQLite database has not been initialized."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, operation, payload });
    });
  }

  resolve({ id, result, error }){
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (error) pending.reject(Object.assign(new Error(error.message), { name: error.name }));
    else pending.resolve(result);
  }

  rejectAll(error){
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
  }

  query(sql, bind = []){ return this.request("query", { sql, bind }); }
  transaction(statements){ return this.request("transaction", { statements }); }
  export(){ return this.request("export"); }
  close(){
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.readyResult = null;
    this.rejectAll(new Error("SQLite database closed."));
  }
}

export const Database = new DatabaseClient();
