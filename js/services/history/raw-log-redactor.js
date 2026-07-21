const ENTITY_KEY = /(?:^|_)(?:user|player|sender|seller|buyer|faction|company|partner|counterparty|recipient)(?:_id|_name)?$/i;
const SECRET_KEY = /(?:api.?key|auth|token|password|email|message|comment|url|description|reason|key_name|^log$)/i;
const EMAIL_OR_URL = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|\/?[\w-]+\.php[?#])/i;

function isObject(value){ return value && typeof value === "object"; }

/** Per-export deterministic pseudonymization. It never mutates source data. */
export class RawLogRedactor {
  constructor(){ this.entities = new Map(); }
  pseudonym(value, kind = "entity"){
    const key = `${kind}:${String(value)}`;
    if (!this.entities.has(key)) this.entities.set(key, `${kind}_${this.entities.size + 1}`);
    return this.entities.get(key);
  }
  redact(value, key = ""){
    if (Array.isArray(value)) return value.map((entry) => this.redact(entry, key));
    if (!isObject(value)) {
      if (SECRET_KEY.test(key) || (typeof value === "string" && EMAIL_OR_URL.test(value))) return "[redacted]";
      if (ENTITY_KEY.test(key) && value !== null && value !== "") return this.pseudonym(value, /faction/i.test(key) ? "faction" : "user");
      return value;
    }
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, this.redact(childValue, childKey)]));
  }
}
