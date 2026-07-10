/**
 * settings.js
 */
import {Storage} from "./storage.js";

const DEFAULT_SETTINGS={
 apiKey:"",
 debug:false,
 theme:"dark",
 autoSync:false
};

export const Settings={
 KEY:"tct.settings",

 load(){
  return {...DEFAULT_SETTINGS,...Storage.load(this.KEY,{})};
 },

 save(settings){
  Storage.save(this.KEY,{...DEFAULT_SETTINGS,...settings});
 },

 defaults(){
  return {...DEFAULT_SETTINGS};
 },

 reset(){
  this.save(DEFAULT_SETTINGS);
 }
};
