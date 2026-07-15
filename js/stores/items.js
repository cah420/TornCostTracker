/**
 * Owned item collection store.
 */
import {Storage} from "../storage.js";
import {OwnedItem} from "../models.js";

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

function aggregateIncomingItems(incomingItems,timestamp){
 const aggregated=new Map();
 incomingItems.forEach((incomingItem)=>{
  const incoming=OwnedItem.from(incomingItem,timestamp);
  const key=String(incoming.id);
  const existing=aggregated.get(key);
  if(!existing){
   aggregated.set(key,incoming);
   return;
  }

  existing.name=incoming.name || existing.name;
  existing.category=incoming.category || existing.category;
  incoming.metadata.sources.forEach((source)=>{
   existing.setLocation(
    source,
    existing.locationQuantity(source)+incoming.locationQuantity(source),
    incoming.locations[source].updated,
   );
   existing.updateMetadata({source,timestamp});
  });
 });
 return [...aggregated.values()];
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
 clear(){
  items=[];
  updated=null;
  tornTimestamp=null;
  Storage.remove(KEY);
  Storage.remove(UPDATED);
  Storage.remove(TORN_TS);
 },
 merge(incomingItems=[],{replaceSources=[]}={}){
  const timestamp=Date.now();
  const collection=new Map(items.map((item)=>[String(item.id),OwnedItem.from(item, item.metadata.created)]));

  replaceSources.forEach((source)=>{
   collection.forEach((item)=>{
    item.setLocation(source,0);
    item.removeSource(source);
    item.updateMetadata({timestamp});
   });
  });

  aggregateIncomingItems(incomingItems,timestamp).forEach((incoming)=>{
   const existing=collection.get(String(incoming.id));
   const item=existing ?? incoming;
   const sources=incoming.metadata.sources;

   if(existing){
    existing.name=incoming.name || existing.name;
    existing.category=incoming.category || existing.category;
    sources.forEach((source)=>{
     existing.setLocation(source,incoming.locationQuantity(source),incoming.locations[source].updated);
     existing.updateMetadata({source,timestamp});
    });
   }else{
    sources.forEach((source)=>item.updateMetadata({source,timestamp}));
    collection.set(String(item.id),item);
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
};
