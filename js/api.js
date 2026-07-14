// v0.5.0 Inventory Foundation
import { Settings } from "./settings.js";
import { Logger } from "./logger.js";
import { createPlayer } from "./models.js";

const BASE_V2="https://api.torn.com/v2";
const BASE_V1="https://api.torn.com";
const DELAY=2500;
let queue=Promise.resolve();
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

function url(base,ep,key){return `${base}${ep}${ep.includes("?")?"&":"?"}key=${encodeURIComponent(key)}`;}

async function request(ep,base=BASE_V2){
 const {apiKey}=Settings.load();
 queue=queue.then(async()=>{const r=await fetch(url(base,ep,apiKey));await sleep(DELAY);return r;});
 const resp=await queue;
 const data=await resp.json();
 if(data.error){Logger.error(data.error);throw new Error(data.error.error);}
 return data;
}

export const API={
 async testConnection(){
  const d=await request("/user?selections=profile");
  return {connected:true,player:createPlayer(d.profile),raw:d};
 },
 async getInventoryPage(category, offset=0, limit=100){
  return request(`/user/inventory?cat=${encodeURIComponent(category)}&offset=${offset}&limit=${limit}`);
 },
 async getBazaarPage(offset=0, limit=100){
  return request(`/user/?selections=bazaar&offset=${offset}&limit=${limit}`,BASE_V1);
 },
 async getDisplayCase(){
  return request("/user/?selections=display",BASE_V1);
 },
 async getItemMarketPage(offset=0){
  return request(`/user/itemmarket?offset=${offset}`);
 },
 async getTornItems(){
  return request("/torn/items");
 },
 async getUserLogs({ from = null, to = null, limit = 100, continuation = null } = {}){
  if (continuation) {
   const next = new URL(continuation, BASE_V2);
   next.searchParams.delete("key");
   const endpoint = `${next.pathname.replace(/^\/v2/, "")}${next.search}`;
   return request(endpoint);
  }
  const parameters = new URLSearchParams({ limit: String(Math.min(Math.max(Number(limit) || 100, 1), 100)) });
  if (Number.isFinite(Number(from))) parameters.set("from", String(Math.floor(Number(from))));
  if (Number.isFinite(Number(to))) parameters.set("to", String(Math.floor(Number(to))));
  return request(`/user/log?${parameters.toString()}`);
 }
};
