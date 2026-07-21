/** Versioned parser registry. Parsers decode raw Torn semantics only. */
export class ParserRegistry {
  constructor(){ this.parsers = []; }
  register(parser){
    if (!parser?.name || !parser?.version || typeof parser.matches !== "function" || typeof parser.parse !== "function") {
      throw new Error("A parser requires name, version, matches(), and parse().");
    }
    if (this.parsers.some((entry) => entry.name === parser.name && entry.version === parser.version)) throw new Error(`Parser ${parser.name}@${parser.version} is already registered.`);
    this.parsers.push(parser);
    this.parsers.sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`));
    return parser;
  }
  select(rawLog){ return this.parsers.filter((parser) => parser.matches(rawLog)); }
  list(){ return this.parsers.map(({ name, version }) => ({ name, version })); }
}

export const RawLogProcessorContract = Object.freeze({
  input: "immutable raw_logs record",
  output: "validated CanonicalEvent records only",
  parserVersion: "independent of database schema and ledger/projection versions",
});

export const ParserResult = Object.freeze({ processed: "processed", unsupported: "unsupported", ignored: "ignored", error: "error" });
