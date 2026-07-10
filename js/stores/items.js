/**
 * Item Store
 */
import {API} from "../api.js";
import {Storage} from "../storage.js";

const KEY="tct.items";
const UPDATED="tct.items.updated";
const TORN_TS="tct.items.tornTimestamp";

let items=Storage.load(KEY,[]);
let updated=Storage.load(UPDATED,null);
let tornTimestamp=Storage.load(TORN_TS,null);

export const ItemStore={
 items(){return [...items];},
 search(q){
  q=q.toLowerCase();
  return items.filter(i=>i.name.toLowerCase().includes(q));
 },
 statistics(){
  return{
   uniqueItems:items.length,
   totalQuantity:items.reduce((a,b)=>a+b.quantity,0),
   lastUpdated:updated,
   tornTimestamp
  };
 },
 lastUpdated(){return updated;},
 async refresh(progress){
  const data=await API.getInventory(progress);
  items=data;
  updated=Date.now();
  tornTimestamp=updated;
  Storage.save(KEY,items);
  Storage.save(UPDATED,updated);
  Storage.save(TORN_TS,tornTimestamp);
  return items;
 }
};
