// Sanitized representative payloads from the redacted July 2026 archive.
export const acquisitionCoverageFixtures = Object.freeze({
  legacyDumpFind: { log: 1401, title: "Dump find (legacy)", timestamp: 1, data: { dumper: 3154490, energy_used: 5, item: 562 }, params: { color: "green" } },
  dumpFind: { log: 1404, title: "Dump find", timestamp: 2, data: { dumper: 3242432, energy_used: 5, item: [{ id: 56, qty: 1, uid: 0 }] }, params: { color: "green" } },
  halloweenTreat: { log: 2536, title: "Halloween treat receive", timestamp: 3, data: { treats: 1, type: "(Trick or Treat)" }, params: { color: "green" } },
  legacyReceive: { log: 4101, title: "Item receive (legacy)", timestamp: 4, data: { item: 374, message: "redacted", quantity: 1, sender: "player-a" } },
  currentReceive: { log: 4103, title: "Item receive", timestamp: 5, data: { items: { 792: 1 }, message: "redacted", sender: "player-a" } },
  tradeIncoming: { log: 4446, title: "Trade items incoming", timestamp: 6, data: { items: [{ id: 1078, qty: 92, uid: null }], parsed_trade_id: 9167353, trade_id: "redacted", user: "player-b" } },
  keepsake: { log: 4850, title: "Keepsake purchase", timestamp: 7, data: { keepsake_received: 1392, points_used: 1000 } },
  referral: { log: 5251, title: "Referral reward", timestamp: 8, data: { donator_days: 31, item: 364, item2: 818, level: 10, points: 250, user: "player-c" } },
  stock: { log: 5530, title: "Stock special item", timestamp: 9, data: { item: { 365: 1 }, stock: 7 } },
  subscription: { log: 5575, title: "Subscription reward", timestamp: 10, data: { first_item: 786, second_item: 369 } },
  virus: { log: 5802, title: "Virus programming complete", timestamp: 11, data: { virus: "a simple" } },
  job: { log: 6401, title: "Job special gain item", timestamp: 12, data: { item: 551, job_points: 19, job_points_used: 5, quantity: 1, special_used: "Steal alcohol (Grocer)" } },
  company: { log: 6505, title: "Company special gain item", timestamp: 13, data: { item: { 366: 2 }, job_points: 49, job_points_used: 40, special_used: 47 } },
  factionPayout: { log: 6797, title: "Faction payout item receive", timestamp: 14, data: { faction: "faction-a", items: { 206: 4 }, percentage: 13.333333333333334, replay: 412019, role: "Muscle", scenario: "Stage Fright", sender: "player-d" } },
  mission: { log: 7900, title: "Missions buy reward item", timestamp: 15, data: { credits_spent: 3, item: 196, quantity: 2 } },
  wheel: { log: 8377, title: "Casino spin the wheel win item", timestamp: 16, data: { item: 791, wheel: "the Wheel of Mediocrity" } },
  christmasFind: { log: 8930, title: "Christmas town find item", timestamp: 17, data: { item: 550 } },
  christmasPurchase: { log: 8934, title: "Christmas town purchase item", timestamp: 18, data: { bucks: 5, item: 586, quantity: 1 } },
  christmasItems: { log: 8938, title: "Christmas town items", timestamp: 19, data: { items: { 985: 1, 986: 1 }, minigame: "visited Santa" } },
  easterEgg: { log: 8980, title: "Easter egg hunt pickup egg", timestamp: 20, data: { egg: 474 } },
});

export const virusProgrammingFixtures = Object.freeze([
  ["a simple", 69],
  ["a polymorphic", 70],
  ["a tunneling", 71],
  ["a armored", 72],
  ["a stealth", 73],
  ["a firewalk", 103],
].map(([virus, itemId], index) => Object.freeze({
  itemId,
  rawLog: Object.freeze({ log: 5802, title: "Virus programming complete", timestamp: 100 + index, data: Object.freeze({ virus }) }),
})));
