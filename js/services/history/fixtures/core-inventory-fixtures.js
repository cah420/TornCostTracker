// Verified field structures from the redacted July 2026 archive sample.
export const coreInventoryFixtures = Object.freeze({
  cityShop: { log: 4200, title: "Item shop buy", timestamp: 1, data: { area: 1, item: 123, quantity: 2, cost_each: 10, cost_total: 20 } },
  bazaar: { log: 1225, title: "Bazaar buy", timestamp: 2, data: { items: [{ id: 124, qty: 3 }], seller: 44, cost_each: 5, cost_total: 15 } },
  itemMarket: { log: 1112, title: "Item market buy", timestamp: 3, data: { items: [{ id: 125, qty: 1 }], seller: 45, anonymous: 0, cost_each: 7, cost_total: 7 } },
  legacyBazaar: { log: 1220, title: "Bazaar buy (legacy)", timestamp: 31, data: { item: 126, quantity: 1, cost_each: 250, cost_total: 250, seller: 46 } },
  legacyBazaarMultiple: { log: 1220, title: "Bazaar buy (legacy)", timestamp: 32, data: { item: 127, quantity: 4, cost_each: 25, cost_total: 100, seller: 47 } },
  abroadPurchase: { log: 4201, title: "Item abroad buy", timestamp: 33, data: { area: 12, item: 128, quantity: 1, cost_each: 400, cost_total: 400 } },
  abroadPurchaseMultiple: { log: 4201, title: "Item abroad buy", timestamp: 34, data: { area: 2, item: 129, quantity: 5, cost_each: 175, cost_total: 875 } },
  tradeOffer: { log: 4482, title: "Trade items add other user", timestamp: 4, data: { items: [{ id: 126, qty: 2 }], user: 46, parsed_trade_id: 77 } },
  crimeItem: { log: 9020, title: "Crime success item gain (new)", timestamp: 5, data: { items_gained: [{ id: 127, qty: 1 }] } },
  crimeCash: { log: 9015, title: "Crime success money gain (new)", timestamp: 6, data: { money_gained: 50 } },
  faction: { log: 6733, title: "Faction give item receive", timestamp: 7, data: { item: [{ id: 128, qty: 1 }], faction: 10, sender: 47 } },
  cityFind: { log: 7011, title: "City item find", timestamp: 8, data: { item: 129 } },
});
