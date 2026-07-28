# Disposal Accounting v1 Log Support

The authoritative 2026-07-24 export requested 101 candidate log IDs. It contained one valid representative for 53 IDs, with no duplicates, unexpected IDs, or malformed records. Parser selection uses exact log ID and payload signature; titles never determine policy by themselves.

## Evidence-backed support matrix

| Log IDs | Exact observed contract | Classification | Canonical and inventory treatment |
|---|---|---|---|
| 1104 | `buyer,cost,item[]` | Item Market sale (old) | Paid disposal; item/UID out; `cost` is known net proceeds |
| 1113 | `anonymous,buyer,cost_each,cost_total,fee,items[]` | Item Market sale | Paid disposal; gross = `cost_total + fee`; net = `cost_total`; realized result uses net |
| 1221 | `buyer,cost_each,cost_total,item,quantity` | Bazaar sale (legacy) | Paid disposal; scalar item quantity out; known net proceeds |
| 1226 | `buyer,cost_each,cost_total,items[]` | Bazaar sale | Paid disposal; item/UID out; known net proceeds |
| 1403 | `items[]` | Loss/destruction: Dump add | Non-cash disposal; known-zero proceeds; basis consumed |
| 2010 | `energy_decreased,faction,happy_increased,item` | Consumption: entertainment | Non-cash disposal; one item out; no revenue |
| 2020 | `faction,happy_increased,item` | Consumption: candy | Non-cash disposal; one item out; no revenue |
| 2030 | `faction,item,nerve_increased` | Consumption: alcohol | Non-cash disposal; one item out; no revenue |
| 2050 | `faction,item` | Consumption: book | Non-cash disposal; one item out; no revenue |
| 2060, 2070, 2080, 2090, 2100 | `faction,hospital_time_decreased,item,life_increased` | Consumption: medical items | Non-cash disposal; one item out; no revenue |
| 2101 | `faction,hospital_time_increased,item` | Consumption: wrong blood type | Adverse result still consumes the item |
| 2102 | `faction,hospital_time_increased,item,radiation_increased` | Consumption: irradiated blood | Adverse result still consumes the item |
| 2105 | `faction,hospital_time_increased,item` | Consumption: ipecac | Non-cash disposal; one item out |
| 2110 | `faction,item,jail_time_decreased` | Consumption: lawyer card | Non-cash disposal; one item out |
| 2180 | `faction,happy_increased,item` | Consumption: erotic DVD | Non-cash disposal; one item out |
| 2200 | `faction,item,nerve_increased` | Consumption: cannabis | Non-cash disposal; one item out |
| 2210 | `faction,happy_increased,item` | Consumption: ecstasy | Non-cash disposal; one item out |
| 2211 | `energy_decreased,faction,happy_decreased,item` | Consumption: ecstasy overdose | Overdose still consumes the item |
| 2230 | `energy_increased,faction,happy_increased,item,nerve_increased` | Consumption: LSD | Non-cash disposal; one item out |
| 2231 | `energy_decreased,faction,happy_decreased,item,nerve_decreased` | Consumption: LSD overdose | Overdose still consumes the item |
| 2240 | `faction,hospital_time_decreased,item,life_increased` | Consumption: opium | Non-cash disposal; one item out |
| 2280 | `faction,happy_increased,item` | Consumption: vicodin | Non-cash disposal; one item out |
| 2281 | `faction,happy_decreased,item` | Consumption: vicodin overdose | Overdose still consumes the item |
| 2290 | `faction,item` | Consumption: xanax | Non-cash disposal; one item out |
| 2291 | `energy_decreased,faction,happy_decreased,hospital_time_increased,item,nerve_decreased` | Consumption: xanax overdose | Overdose still consumes the item |
| 2300, 2310, 2320 | `faction,item,target` | Consumption: target items | Target retained; basis consumed; no revenue |
| 2410 | `faction,happy_increased,item` | Consumption: tissues | Non-cash disposal; one item out |
| 2420 | `faction,happy_decreased,item` | Consumption: vanity mirror | Non-cash disposal; one item out |
| 2450 | `faction,item` | Consumption: frosting/lock pick | Non-cash disposal; one item out |
| 2460 | `faction,hospital_time_increased,item,jail_time_decreased` | Consumption: felovax | Non-cash disposal; one item out |
| 2470 | `faction,hospital_time_decreased,item` | Consumption: zylkene | Non-cash disposal; one item out |
| 2480 | `faction,item,item2` | Conversion: Duke's Safe | Exact input/output IDs; excluded from ordinary disposal FIFO |
| 4102 | `items[],message,receiver` | Gift/donation: Item send | Recipient and UIDs preserved; supersedes old neutral-transfer treatment |
| 4210 | `area,item,quantity,total_value,value_each` | City Shop sale | Paid disposal; shop area retained; known net proceeds |
| 4445 | `items[],parsed_trade_id,trade_id,user` | Trade evidence | Activity only; requires completed inverse-trade correlation |
| 6728 | `faction,items[]` | Gift/donation: Faction deposit | Personal items leave ownership for faction inventory |
| 6732 | `faction,items[],receiver` | Faction-owned transfer | Review-only; no personal Inventory Position effect |
| 7000 | `points_received,quantity,set` | Conversion input | Review-only because the set name does not prove component Item IDs |
| 8936 | `item` | Gift/donation: Christmas pot | Known-zero proceeds; destination reason retained |
| 8981 | `egg,energy_increased` | Consumption: green egg | Non-cash disposal |
| 8982 | `egg,nerve_increased` | Consumption: red egg | Non-cash disposal |
| 8983 | `egg,happy_increased` | Consumption: yellow egg | Non-cash disposal |
| 8985 | `egg,money_increased` | Item-to-cash conversion: black egg | Exact item input and cash output; excluded from ordinary disposal FIFO |
| 9163 | `crime_action,items_lost,nerve,outcome` | Loss/destruction | Complete item quantity map out; known-zero proceeds |
| 9300, 9301 | `items_added` | Conversion input | Review-only: quantity exists but canonical Item ID is absent |
| 9302 | `first_item,second_item` | Conversion input | Both input IDs retained; excluded from ordinary disposal FIFO |

UID-bearing records preserve the observed UID. A UID attached to quantity greater than one is rejected as ambiguous. Stack quantities remain fungible.

## Correlated trade sales

Log 4445 is evidence only. Eligibility requires records sharing `parsed_trade_id` to prove completion (4430), incoming cash (4441), no outgoing cash (4440), and no incoming items (4446). The opaque `trade_id` must also agree when present. One unique Item ID resolves automatically; multiple Item IDs require balanced manual net-proceeds allocation.

## Unobserved candidates

The following 48 IDs had no representative record and remain unsupported:

`1400, 1500, 2040, 2120, 2130, 2140, 2150, 2160, 2170, 2190, 2201, 2220, 2221, 2241, 2250, 2251, 2260, 2261, 2270, 2271, 2295, 2301, 2311, 2321, 2325, 2370, 2381, 2406, 2430, 2440, 2490, 2501, 2600, 4005, 4006, 4100, 4104, 4220, 4322, 6002, 6725, 6730, 8984, 8986, 8987, 8988, 8989, 15021`.

They must not be implemented from titles or memory.
