// v0.5.0 Inventory Foundation
import { Settings } from "./settings.js";
import { Logger } from "./logger.js";
import { createPlayer, createInventoryItem } from "./models.js";

const BASE="https://api.torn.com/v2";
const DELAY=2500;
const CATEGORIES=["Collectible","Clothing","Other","Tool","Melee","Defensive","Material","Car","Primary","Secondary","Book","Special","Supply Pack","Temporary","Enhancer","Artifact","Flower","Booster","Medical","Candy","Jewelry","Alcohol","Plushie","Drug","Energy Drink"];
let queue=Promise.resolve();
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

function url(ep,key){return `${BASE}${ep}${ep.includes("?")?"&":"?"}key=${encodeURIComponent(key)}`;}

async function request(ep){
 const {apiKey}=Settings.load();
 queue=queue.then(async()=>{const r=await fetch(url(ep,apiKey));await sleep(DELAY);return r;});
 const resp=await queue;
 const data=await resp.json();
 if(data.error){Logger.error(data.error);throw new Error(data.error.error);}
 return data;
}

async function downloadCategory(cat,progress){
 const limit=100;
 let offset=0,items=[];
 while(true){
  const d=await request(`/user/inventory?cat=${encodeURIComponent(cat)}&offset=${offset}&limit=${limit}`);
  items.push(...d.inventory.items.map(i=>({...createInventoryItem(i),name:i.name,category:cat,equipped:i.equipped})));
  progress&&progress({category:cat,count:items.length,total:d._metadata.total});
  if(!d._metadata.links.next)break;
  offset+=limit;
 }
 return items;
}

export const API={
 async testConnection(){
  const d=await request("/user?selections=profile");
  return {connected:true,player:createPlayer(d.profile),raw:d};
 },
 async getInventory(progress){
  let inv=[];
  for(let i=0;i<CATEGORIES.length;i++){
   progress&&progress({phase:"category",current:i+1,total:CATEGORIES.length,category:CATEGORIES[i]});
   inv.push(...await downloadCategory(CATEGORIES[i],progress));
  }
  return inv.sort((a,b)=>a.name.localeCompare(b.name));
 }
};
