/**
 * Owned item collection store.
 */
import {Storage} from "../storage.js";
import {OwnedItem} from "../models.js";
import {InventoryImporter} from "../services/importers/inventory-importer.js";

const KEY="tct.items";
const UPDATED="tct.items.updated";
const TORN_TS="tct.items.tornTimestamp";

let updated=Storage.load(UPDATED,null);
let tornTimestamp=Storage.load(TORN_TS,null);
let items=Storage.load(KEY,[]).map((item)=>OwnedItem.from(item, updated ?? Date.now()));

function persist(){
 Storage.save(KEY,items);
 Storage.save(UPDATED,updated);
 Storage.save(TORN_TS,tornTimestamp);
}

function itemCopies(){
 return items.map((item)=>OwnedItem.from(item, item.metadata.created));
}

export const ItemStore={
 items(){return itemCopies();},
 search(q){
  q=q.toLowerCase();
  return itemCopies().filter(i=>i.name.toLowerCase().includes(q));
 },
 statistics(){
  return{
   uniqueItems:items.length,
   totalQuantity:items.reduce((a,b)=>a+b.totalQuantity,0),
   lastUpdated:updated,
   tornTimestamp
  };
 },
 lastUpdated(){return updated;},
 merge(incomingItems,{source,replaceSource=false}={}){
  if(!source) throw new Error("ItemStore.merge requires a source.");

  const timestamp=Date.now();
  const collection=new Map(items.map((item)=>[item.id,OwnedItem.from(item, item.metadata.created)]));

  if(replaceSource){
   collection.forEach((item)=>{
    item.setLocation(source,0);
    item.removeSource(source);
    item.updateMetadata({timestamp});
   });
  }

  incomingItems.forEach((incomingItem)=>{
   const incoming=OwnedItem.from(incomingItem,timestamp);
   const existing=collection.get(incoming.id);
   const item=existing ?? incoming;

   if(existing){
    existing.name=incoming.name || existing.name;
    existing.category=incoming.category || existing.category;
    existing.setLocation(source,incoming.locations[source]);
    existing.updateMetadata({source,timestamp});
   }else{
    item.updateMetadata({source,timestamp});
    collection.set(item.id,item);
   }
  });

  items=[...collection.values()]
   .filter((item)=>item.totalQuantity>0)
   .sort((left,right)=>left.name.localeCompare(right.name));
  updated=timestamp;
  tornTimestamp=timestamp;
  persist();
  return this.items();
 },
 async refresh(progress){
  const importedItems=await InventoryImporter.import(progress);
  return this.merge(importedItems,{source:"inventory",replaceSource:true});
 }
};
