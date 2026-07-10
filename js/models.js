export function createPlayer(p){return {id:p.id,name:p.name,level:p.level,rank:p.rank,factionID:p.faction_id,avatar:p.image};}
export function createInventoryItem(i){return {itemID:i.id,quantity:i.amount??0};}
