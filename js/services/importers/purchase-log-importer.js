/**
 * The only module that understands Torn user-log response fields and titles.
 * It returns canonical Acquisition records and never persists raw log payloads.
 */
import { API } from "../../api.js";
import { Acquisition } from "../../models.js";

const PAGE_SIZE = 100;
const TRAVEL_AREAS = Object.freeze({
  // Torn log area codes are distinct from the public travel-country enum.
  // Confirmed from `Item abroad buy` logs.
  2: "Mexico",
  3: "Hawaii",
  4: "South Africa",
  5: "Japan",
  6: "China",
  7: "Argentina",
  8: "Switzerland",
  9: "Canada",
  10: "United Kingdom",
  11: "UAE",
  12: "Cayman Islands",
});
const TITLE = {
  bazaarPurchase: /bazaar.*(?:buy|bought|purchased|purchase)|(?:buy|bought|purchased|purchase).*bazaar/i,
  itemMarketPurchase: /item market.*(?:buy|bought|purchased|purchase)|(?:buy|bought|purchased|purchase).*item market/i,
  cityShopPurchase: /(?:city|item) shop.*(?:buy|bought|purchased|purchase)|(?:buy|bought|purchased|purchase).*(?:city|item) shop/i,
  abroadShopPurchase: /(?:abroad|foreign|travel).*(?:buy|bought|purchased|purchase)|(?:buy|bought|purchased|purchase).*(?:abroad|foreign|travel)/i,
  tradeMoneyOutgoing: /trade.*(?:money|cash).*(?:sent|outgoing|paid)|(?:sent|paid).*(?:money|cash).*trade/i,
  tradeItemsIncoming: /trade.*items?.*(?:received|incoming)|(?:received|incoming).*items?.*trade/i,
  tradeCompleted: /trade.*(?:completed|complete)/i,
  bazaarInternalMovement: /bazaar.*(?:add|remove|edit|open\s*\/?\s*close|sell)|(?:add|remove|edit|open\s*\/?\s*close|sell).*bazaar/i,
  tradeLifecycle: /trade.*(?:initiate|expire|items?.*add.*other user)/i,
};

function number(value){
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function object(value){
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function logCollection(response){
  // API response shape handling belongs here with the rest of Torn-specific decoding.
  return Array.isArray(response?.logs) ? response.logs : Array.isArray(response?.log) ? response.log : [];
}

function logId(log){
  return log?.id ?? log?.log_id ?? null;
}

function logTypeFor(log){
  return log?.details?.id ?? log?.log ?? log?.log_id ?? "unknown";
}

function timestampFor(log){
  return number(log?.timestamp ?? log?.date ?? log?.created_at);
}

function titleFor(log){
  return String(log?.details?.title ?? log?.title ?? log?.log_title ?? log?.text ?? "");
}

function dataFor(log){
  // Torn v2 separates dynamic values between `data` and `params`.
  // Keep that response-specific knowledge inside this importer.
  return { ...object(log?.params), ...object(log?.data) };
}

function tradeIdFor(log, data){
  const value = log?.parsed_trade_id ?? data?.parsed_trade_id ?? data?.trade_id ?? data?.id;
  return value === null || value === undefined || value === "" ? null : String(value);
}

function counterpartyFor(data){
  return number(data?.seller_id ?? data?.user_id ?? data?.player_id ?? data?.partner_id ?? data?.counterparty_id);
}

function locationFor(data){
  const value = data?.country ?? data?.country_name ?? data?.location ?? data?.city ?? data?.shop_location;
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.name ?? value.country ?? value.city ?? null;
  return TRAVEL_AREAS[Number(data?.area)] ?? null;
}

function itemsFor(data){
  const values = Array.isArray(data?.items)
    ? data.items
    : data?.items && typeof data.items === "object"
      ? Object.entries(data.items).map(([itemId, value]) =>
        value && typeof value === "object" ? { item_id: itemId, ...value } : { item_id: itemId, quantity: value },
      )
      : data?.item
        ? [data.item]
        : data?.item_id ?? data?.itemID
          ? [data]
          : [];
  return values.map((item) => {
    const itemId = number(item?.item_id ?? item?.id ?? item?.itemID ?? item ?? data?.item_id ?? data?.itemID ?? data?.item);
    const quantity = number(
      item?.quantity ?? item?.amount ?? item?.qty ?? item?.count ??
      data?.quantity ?? data?.amount ?? data?.qty ?? data?.count ?? data?.item_quantity ?? data?.item_qty,
    ) ?? 1;
    const unitCost = number(item?.cost_each ?? item?.price_each ?? item?.unit_cost ?? data?.cost_each ?? data?.price_each);
    const lineTotal = number(item?.cost ?? item?.total_cost ?? item?.price ?? data?.total_cost);
    return {
      itemId,
      quantity,
      knownUnitCost: unitCost,
      knownLineTotal: lineTotal ?? (unitCost !== null ? unitCost * quantity : null),
    };
  }).filter((item) => item.itemId !== null && item.quantity > 0);
}

function totalCostFor(data, lines){
  const explicit = number(data?.total_cost ?? data?.cost_total ?? data?.total ?? data?.price_total ?? data?.cost);
  if (explicit !== null) return explicit;
  return lines.length === 1 ? lines[0].knownLineTotal : null;
}

function normalizePurchase(log, sourceType){
  const data = dataFor(log);
  const id = logId(log);
  const timestamp = timestampFor(log);
  if (id === null || timestamp === null) return null;
  const itemLines = itemsFor(data);
  if (!itemLines.length) return null;
  const costStatus = itemLines.every((line) => line.knownUnitCost !== null) ? "known" : "unresolved";
  return new Acquisition({
    id: `log:${id}`,
    timestamp,
    sourceType,
    sourceLocation: sourceType === "abroadShop" ? locationFor(data) : null,
    counterpartyId: counterpartyFor(data),
    totalCashCost: totalCostFor(data, itemLines),
    itemLines,
    acquisitionKind: "paid",
    costStatus,
    acquisitionMethod: sourceType,
  }).toJSON();
}

function normalizeTrades(logs){
  const trades = new Map();
  logs.forEach((log) => {
    const data = dataFor(log);
    const tradeId = tradeIdFor(log, data);
    if (!tradeId) return;
    const title = titleFor(log);
    const entry = trades.get(tradeId) ?? { tradeId, logs: [], money: null, itemLines: [], counterpartyId: null, timestamp: null, completed: false };
    entry.logs.push(log);
    entry.timestamp = Math.max(entry.timestamp ?? 0, timestampFor(log) ?? 0);
    entry.counterpartyId ??= counterpartyFor(data);
    if (TITLE.tradeMoneyOutgoing.test(title)) {
      entry.money = number(data?.money ?? data?.amount ?? data?.cash ?? data?.cost ?? data?.total);
    }
    if (TITLE.tradeItemsIncoming.test(title)) {
      entry.itemLines.push(...itemsFor(data).map((line) => ({ ...line, knownUnitCost: null, knownLineTotal: null })));
    }
    if (TITLE.tradeCompleted.test(title)) entry.completed = true;
    trades.set(tradeId, entry);
  });

  return [...trades.values()].flatMap((trade) => {
    if (!trade.completed || trade.money === null || !trade.itemLines.length || !trade.timestamp) return [];
    const itemLines = trade.itemLines;
    const singleLine = itemLines.length === 1;
    if (singleLine) {
      itemLines[0].knownLineTotal = trade.money;
      itemLines[0].knownUnitCost = trade.money / itemLines[0].quantity;
    }
    return [new Acquisition({
      id: `trade:${trade.tradeId}`,
      timestamp: trade.timestamp,
      sourceType: "trade",
      counterpartyId: trade.counterpartyId,
      tradeId: trade.tradeId,
      totalCashCost: trade.money,
      itemLines,
      allocationStatus: singleLine ? "resolved" : "unresolved",
      acquisitionKind: singleLine ? "paid" : "unresolved",
      costStatus: singleLine ? "known" : "unresolved",
      acquisitionMethod: "trade",
    }).toJSON()];
  });
}

function isExplicitInternalMovement(title){
  return TITLE.bazaarInternalMovement.test(title) || TITLE.tradeLifecycle.test(title);
}

function isHandledTitle(title){
  return TITLE.bazaarPurchase.test(title) ||
    TITLE.itemMarketPurchase.test(title) ||
    TITLE.cityShopPurchase.test(title) ||
    TITLE.abroadShopPurchase.test(title) ||
    TITLE.tradeMoneyOutgoing.test(title) ||
    TITLE.tradeItemsIncoming.test(title) ||
    TITLE.tradeCompleted.test(title) ||
    isExplicitInternalMovement(title);
}

function unsupportedIncomingSignatures(logs){
  const signatures = new Map();
  logs.forEach((log) => {
    const title = titleFor(log);
    if (isHandledTitle(title)) return;
    const fields = Object.keys(dataFor(log)).sort();
    const appearsToContainItems = fields.some((field) =>
      ["item", "item_id", "itemID", "items", "items_gained"].includes(field),
    );
    if (!appearsToContainItems) return;
    const logType = String(logTypeFor(log));
    const key = `${logType}\u0000${title}\u0000${fields.join(",")}`;
    const existing = signatures.get(key) ?? { logType, title, fieldNames: fields, occurrences: 0 };
    existing.occurrences += 1;
    signatures.set(key, existing);
  });
  return [...signatures.values()].sort((left, right) => right.occurrences - left.occurrences);
}

function normalizedRecords(logs){
  const records = [];
  logs.forEach((log) => {
    const title = titleFor(log);
    if (TITLE.bazaarPurchase.test(title)) records.push(normalizePurchase(log, "bazaar"));
    if (TITLE.itemMarketPurchase.test(title)) records.push(normalizePurchase(log, "itemMarket"));
    if (TITLE.cityShopPurchase.test(title)) records.push(normalizePurchase(log, "cityShop"));
    if (TITLE.abroadShopPurchase.test(title)) records.push(normalizePurchase(log, "abroadShop"));
  });
  records.push(...normalizeTrades(logs));
  return records.filter(Boolean);
}

// Exported for deterministic importer tests. Torn-specific shapes remain
// confined to this module.
export function normalizeAcquisitionLogs(logs = []){
  return normalizedRecords(logs).filter(Boolean);
}

function pageCheckpoint(logs){
  const latestTimestamp = Math.max(...logs.map(timestampFor).filter((value) => value !== null));
  if (!Number.isFinite(latestTimestamp)) return { timestamp: null, logIds: [] };
  return {
    timestamp: latestTimestamp,
    logIds: logs
      .filter((log) => timestampFor(log) === latestTimestamp)
      .map(logId)
      .filter((id) => id !== null)
      .map(String),
  };
}

export const PurchaseLogImporter = {
  async import({ fromTimestamp = null, toTimestamp = null, checkpoint = null, progress } = {}){
    const logs = new Map();
    let cursorTo = toTimestamp;
    let continuation = null;
    let pageNumber = 0;
    let exhausted = false;
    const pageTrace = [];

    while (!exhausted) {
      pageNumber += 1;
      progress?.({ pageNumber, message: `Downloading purchase logs (page ${pageNumber})...` });
      const response = await API.getUserLogs({
        from: continuation ? null : fromTimestamp,
        to: continuation ? null : cursorTo,
        limit: PAGE_SIZE,
        continuation,
      });
      const page = logCollection(response);
      const timestamps = page.map(timestampFor).filter((value) => value !== null);
      const nextLink = response?._metadata?.links?.next ?? null;
      pageTrace.push({
        page: pageNumber,
        records: page.length,
        oldestTimestamp: timestamps.length ? Math.min(...timestamps) : null,
        newestTimestamp: timestamps.length ? Math.max(...timestamps) : null,
        usedContinuation: Boolean(continuation),
        hasNextLink: Boolean(nextLink),
      });
      page.forEach((log) => {
        const id = logId(log);
        if (id !== null) logs.set(String(id), log);
      });
      if (!page.length) {
        exhausted = true;
        continue;
      }

      // Torn provides the authoritative next-page cursor. Prefer it over
      // timestamp arithmetic so dense log periods cannot terminate early.
      if (nextLink) {
        continuation = nextLink;
        continue;
      }
      const oldest = Math.min(...timestamps);
      if (!Number.isFinite(oldest) || (fromTimestamp !== null && oldest <= fromTimestamp)) {
        exhausted = true;
        continue;
      }
      // `to` is intentionally overlapped so entries sharing the boundary timestamp are retained.
      if (cursorTo !== null && oldest >= cursorTo) {
        exhausted = true;
        continue;
      }
      cursorTo = oldest;

      if (checkpoint?.timestamp !== null && checkpoint?.timestamp !== undefined && oldest < checkpoint.timestamp) {
        exhausted = true;
      }
    }

    // Defensive boundary check: do not create records from a page that overlaps
    // the requested lower bound even if Torn returns an inclusive extra row.
    const rawLogs = [...logs.values()].filter((log) =>
      fromTimestamp === null || (timestampFor(log) !== null && timestampFor(log) >= fromTimestamp),
    );
    const deduped = new Map(normalizedRecords(rawLogs).map((record) => [record.id, record]));
    const unsupportedSignatures = unsupportedIncomingSignatures(rawLogs);
    console.info("Purchase log import summary", {
      fetchedLogs: rawLogs.length,
      normalizedAcquisitions: deduped.size,
      pages: pageTrace,
    });
    if (unsupportedSignatures.length) {
      console.info("Unsupported incoming acquisition signatures", unsupportedSignatures);
    }
    return {
      records: [...deduped.values()],
      checkpoint: pageCheckpoint(rawLogs),
      pages: pageNumber,
      logCount: rawLogs.length,
    };
  },
};
