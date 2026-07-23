# Acquisition Coverage Decisions

This document records the evidence-backed accounting treatment for the acquisition coverage sprint. Each raw parser is dispatched by exact Torn log ID and accepts only the observed `data` signature. Similar legacy and current titles do not share a guessing parser.

The reviewed export contains 58 representative records across the 20 target IDs. Every target has one observed `data` signature. Presentation-only `params` are outside the accounting contract and may vary.

| ID | Torn title | Observed `data` fields | Canonical result | Inventory / Cost Lot result | Basis policy |
| --- | --- | --- | --- | --- | --- |
| 1401 | Dump find (legacy) | `dumper, energy_used, item` | `reward` | One inbound item / new lot | Known zero cash |
| 1404 | Dump find | `dumper, energy_used, item[]` | `reward` | All inbound item rows / new lots | Known zero cash |
| 2536 | Halloween treat receive | `treats, type` | non-inventory `activity` | Excluded from acquisition coverage; no supply | Not applicable |
| 4101 | Item receive (legacy) | `item, message, quantity, sender` | `gift_received` | Inbound gift quantity / new lot | Known zero cash |
| 4103 | Item receive | `items, message, sender` | `gift_received` | All inbound gift quantities / new lots | Known zero cash |
| 4446 | Trade items incoming | `items[], parsed_trade_id, trade_id, user` | correlation-required `activity` | Non-inventory evidence; excluded from acquisition coverage | Correlation required |
| 4850 | Keepsake purchase | `keepsake_received, points_used` | `non_cash_acquisition` | One inbound item / new lot | Unknown; points not converted to cash |
| 5251 | Referral reward | `donator_days, item, item2, level, points, user` | `reward` | Both inbound items / new lots | Unknown |
| 5530 | Stock special item | `item, stock` | `reward` | All mapped items / new lots | Unknown |
| 5575 | Subscription reward | `first_item, second_item` | `reward` | Both inbound items / new lots | Unknown |
| 5802 | Virus programming complete | `virus` | resolved `reward` | One resolved inbound item / new lot | Known zero cash |
| 6401 | Job special gain item | `item, job_points, job_points_used, quantity, special_used` | `non_cash_acquisition` | Inbound stated quantity / new lot | Unknown; job points not converted to cash |
| 6505 | Company special gain item | `item, job_points, job_points_used, special_used` | `non_cash_acquisition` | All mapped items / new lots | Unknown; job points not converted to cash |
| 6797 | Faction payout item receive | `faction, items, percentage, replay, role, scenario, sender` | `reward` | All mapped items / new lots | Unknown |
| 7900 | Missions buy reward item | `credits_spent, item, quantity` | `non_cash_acquisition` | Inbound stated quantity / new lot | Unknown; mission credits not converted to cash |
| 8377 | Casino spin the wheel win item | `item, wheel` | `reward` | One inbound item / new lot | Unknown |
| 8930 | Christmas Town find item | `item` | `reward` | One inbound item / new lot | Known zero cash |
| 8934 | Christmas Town purchase item | `bucks, item, quantity` | `non_cash_acquisition` | Inbound stated quantity / new lot | Unknown; Christmas bucks not converted to cash |
| 8938 | Christmas Town items | `items, minigame` | `reward` | All mapped items / new lots | Unknown |
| 8980 | Easter egg hunt pickup egg | `egg` | `reward` | One inbound item / new lot | Known zero cash |

## Accounting boundaries

- A known zero-cash lot requires an explicit verified find/pickup policy. Missing cash fields alone never imply zero basis.
- `non_cash_acquisition` means the item was obtained using a non-cash resource whose Torn-dollar value is not derived here. Its physical quantity is valid supply while its basis remains unknown.
- An unpriced reward also creates physical supply with unknown basis unless its mechanism is explicitly verified as zero cash.
- Confirmed 4101/4103 receipts are gifts and create zero-cash supply. The separate 4102 send contract remains a neutral transfer.
- The 4446 trade record is not an owned-inventory movement or a completed trade aggregate. It remains correlation evidence and is excluded from acquisition coverage.
- The 2536 Halloween treat receipt does not add inventory and is excluded from acquisition coverage.
- The 5802 `virus` identifier is resolved outside the raw parser through `resolveItemId({ source: "virus", identifier })`. An unknown value produces no canonical event or supply.
- UID `0` and `null` are treated as absent identity. A real UID is preserved and may only accompany quantity one.
- Torn inventory snapshots remain external reconciliation statements and never manufacture acquisition history.

## Item Resolution

The Item Resolution service owns deterministic source-identifier translations required by accounting replay. The 5802 parser never contains the mapping itself.

| Torn identifier | Canonical item |
| --- | --- |
| `a simple` | Simple Virus (69) |
| `a polymorphic` | Polymorphic Virus (70) |
| `a tunneling` | Tunneling Virus (71) |
| `a armored` | Armored Virus (72) |
| `a stealth` | Stealth Virus (73) |
| `a firewalk` | Firewalk Virus (103) |

These canonical IDs are documented by Torn's official wiki: [Simple Virus](https://wiki.torn.com/wiki/Simple_Virus), [Polymorphic Virus](https://wiki.torn.com/wiki/Polymorphic_Virus), [Tunneling Virus](https://wiki.torn.com/wiki/Tunneling_Virus), [Armored Virus](https://wiki.torn.com/wiki/Armored_Virus), [Stealth Virus](https://wiki.torn.com/wiki/Stealth_Virus), and [Firewalk Virus](https://wiki.torn.com/wiki/Firewalk_Virus).

## Support status

The revised target set contains 18 acquisition-bearing IDs after removing 2536 and 4446 from acquisition coverage. All 18 create verified quantity-bearing Cost Lots. Log 4446 remains partially supported only as future trade-correlation evidence; 2536 is supported non-inventory activity.

The complete candidate list is now 54 acquisition IDs rather than 56. Twenty-seven currently create verified acquisition lots and 27 remain unsupported because no archived payload evidence was available. Relative to the original 56-ID research list, the status is 27 supported acquisitions, 27 unsupported acquisitions, and two IDs reclassified as non-acquisitions.

The remaining unsupported acquisition IDs are: 1402, 1501, 2530, 2548, 4105, 4320, 5600, 5725, 6525, 6731, 6750, 6751, 6752, 6753, 8170, 8855, 8932, and 8960–8969.
