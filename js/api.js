/**
 * api.js
 */
import {Settings} from "./settings.js";
import {Logger} from "./logger.js";
import {createPlayer} from "./models.js";

const BASE="https://api.torn.com/v2";

function buildUrl(endpoint,key){
 return `${BASE}${endpoint}${endpoint.includes("?")?"&":"?"}key=${encodeURIComponent(key)}`;
}

async function request(endpoint){
 const {apiKey}=Settings.load();
 if(!apiKey) throw new Error("No API key configured.");

 const response=await fetch(buildUrl(endpoint,apiKey));
 if(!response.ok) throw new Error(`HTTP ${response.status}`);

 const data=await response.json();

 if(data.error){
  Logger.error(data.error);
  throw new Error(data.error.error);
 }

 return data;
}

export const API={
 async testConnection(){
  Logger.info("Testing Torn API connection...");
  const data=await request("/user?selections=profile");
  return{
   connected:true,
   player:createPlayer(data.profile),
   raw:data
  };
 }
};
