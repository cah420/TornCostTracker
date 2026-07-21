/**
 * Future parser/replay boundary. Raw import deliberately has no dependency on
 * this registry; parser versions describe derived interpretations only.
 */
export class ParserRegistry {
  constructor(){ this.processors = new Map(); }
  register({ id, version, process }){
    if (!id || !version || typeof process !== "function") throw new Error("A parser requires an id, version, and process function.");
    this.processors.set(id, { id, version, process });
  }
  list(){ return [...this.processors.values()].map(({ id, version }) => ({ id, version })); }
}

export const RawLogProcessorContract = Object.freeze({
  input: "immutable raw_logs record",
  output: "future canonical events only",
  parserVersion: "independent of database schema and projection versions",
});
