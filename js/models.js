/**
 * models.js
 */
export function createPlayer(profile){
 return{
  id:profile.id,
  name:profile.name,
  level:profile.level,
  rank:profile.rank,
  factionID:profile.faction_id,
  avatar:profile.image,
  status:profile.status?.description??"",
  raw:profile
 };
}
export function createInventoryItem(item){
 return{
  itemID:item.id,
  quantity:item.quantity??item.qty??0
 };
}
export function createPurchase(p){
 return{
  itemID:p.itemID??p.id,
  quantity:p.quantity??p.qty??1,
  unitPrice:p.unitPrice??p.cost_each??0,
  totalPrice:p.totalPrice??p.cost_total??0,
  timestamp:p.timestamp??0,
  source:p.source??"Unknown"
 };
}
export function createSettings(data={}){
 return{
  apiKey:data.apiKey??"",
  debug:data.debug??false
 };
}
