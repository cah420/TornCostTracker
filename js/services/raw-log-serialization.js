/**
 * Stable JSON serialization for immutable raw Torn log evidence. Object keys
 * are sorted recursively; arrays retain their source ordering. Consequently
 * property-order-only API changes do not create false payload conflicts.
 */
export function stableStringify(value){
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export async function sha256Hex(value){
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable.");
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
