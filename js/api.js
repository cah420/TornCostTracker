// v0.5.0 Inventory Foundation
import { Settings } from "./settings.js";
import { Logger } from "./logger.js";
import { createPlayer } from "./models.js";
import { Events } from "./events.js";
import {
 TornRequestQueue,
 TORN_REQUEST_INTERVAL_MS,
} from "./api-queue.js";

const BASE_V2="https://api.torn.com/v2";
const BASE_V1="https://api.torn.com";
let requestQueue = new TornRequestQueue({
 onRateLimitRetry: ({ retryCount, backoffMs }) => {
  const seconds = Math.ceil(backoffMs / 1000);
  Events.emit("statusChanged", {
   stage: "api",
   status: "rateLimited",
   message: `Torn API rate limit reached. Retrying in ${seconds} seconds (attempt ${retryCount}).`,
  });
 },
});

function url(base,ep,key){return `${base}${ep}${ep.includes("?")?"&":"?"}key=${encodeURIComponent(key)}`;}

function rateLimitError(response, data){
 const message = String(data?.error?.error ?? data?.error ?? "");
 return response.status === 429 || Number(data?.error?.code) === 5 || /rate\s*limit|too many requests/i.test(message);
}

function responseError(response, data){
 const message = data?.error?.error ?? data?.error ?? `Torn API request failed (${response.status}).`;
 const error = new Error(message);
 error.isTornRateLimit = rateLimitError(response, data);
 return error;
}

async function request(ep,base=BASE_V2){
 const {apiKey}=Settings.load();
 try {
  return await requestQueue.enqueue(async()=>{
   const response = await fetch(url(base,ep,apiKey));
   let data;
   try {
    data = await response.json();
   } catch {
    data = null;
   }
   if (!response.ok || data?.error) throw responseError(response, data);
   return data;
  });
 } catch (error) {
  Logger.error(error.message);
  throw error;
 }
}

// Test-only seams keep scheduler timing deterministic without exposing a user setting.
export function setTornRequestQueueForTesting(queue){ requestQueue = queue; }
export function resetTornRequestQueueForTesting(){
 requestQueue = new TornRequestQueue();
}
export { TORN_REQUEST_INTERVAL_MS };

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
 async getTornLogTypes(){
  return request("/torn/?selections=logtypes", BASE_V1);
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
