let state = {
  status: "notInitialized",
  persistence: "localStorage",
  vfs: null,
  sqliteVersion: null,
  schemaVersion: 0,
  lastError: null,
};

export const DatabaseDiagnostics = {
  set(update){ state = { ...state, ...update }; },
  snapshot(){ return structuredClone(state); },
};
