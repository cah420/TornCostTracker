function object(value){
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch { return {}; }
}
export function typeFor(log){ return Number(log?.details?.id ?? log?.log ?? log?.log_id); }
export function titleFor(log){ return String(log?.details?.title ?? log?.title ?? ""); }
export function dataFor(log){ return { ...object(log?.params), ...object(log?.data) }; }
export function number(value){ const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
export function itemLines(value, fallbackQuantity = 1){
  const entries = Array.isArray(value) ? value : value && typeof value === "object" && !value.id && !value.item_id ? Object.entries(value).map(([id, entry]) => entry && typeof entry === "object" ? { id, ...entry } : { id, qty: entry }) : value === undefined || value === null ? [] : [value];
  return entries.map((entry) => {
    const itemId = number(entry?.id ?? entry?.item_id ?? entry);
    const quantity = number(entry?.qty ?? entry?.quantity ?? entry?.amount) ?? fallbackQuantity;
    return itemId === null || quantity <= 0 ? null : { itemId, quantity };
  }).filter(Boolean);
}
export function itemMovements(direction, value, role, fallbackQuantity = 1){ return itemLines(value, fallbackQuantity).map(({ itemId, quantity }) => ({ direction, resourceType: "item", resourceId: String(itemId), quantity, unit: "item", role, attributes: {} })); }
