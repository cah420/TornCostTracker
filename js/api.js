// v0.5.0 Inventory Foundation
import { Settings } from "./settings.js";
import { Logger } from "./logger.js";
import { createPlayer } from "./models.js";

const BASE="https://api.torn.com/v2";
const DELAY=2500;
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

export const API={
 async testConnection(){
  const d=await request("/user?selections=profile");
  return {connected:true,player:createPlayer(d.profile),raw:d};
 },
 async getInventoryPage(category, offset=0, limit=100){
  return request(`/user/inventory?cat=${encodeURIComponent(category)}&offset=${offset}&limit=${limit}`);
 }
};
