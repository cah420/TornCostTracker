/**
 * storage.js
 * Centralized localStorage helper.
 */
export const Storage={
 load(key,fallback=null){
  try{
   const raw=localStorage.getItem(key);
   return raw===null?fallback:JSON.parse(raw);
  }catch(e){
   console.error("Storage load failed:",e);
   return fallback;
  }
 },
 save(key,value){
  localStorage.setItem(key,JSON.stringify(value));
 },
 remove(key){localStorage.removeItem(key);},
 clear(){localStorage.clear();}
};
