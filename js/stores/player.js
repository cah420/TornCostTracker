/**
 * Stores the locally cached identity of the API-key owner.
 */
import { API } from "../api.js";
import { Settings } from "../settings.js";
import { Storage } from "../storage.js";

const KEY = "tct.player";
let player = Storage.load(KEY, null);

function copy(){
  return player ? { ...player } : null;
}

export const PlayerStore = {
  current(){
    return copy();
  },
  save(nextPlayer){
    player = {
      id: nextPlayer.id,
      name: nextPlayer.name,
      level: nextPlayer.level,
      rank: nextPlayer.rank,
      avatar: nextPlayer.avatar,
    };
    Storage.save(KEY, player);
    return copy();
  },
  async refresh(){
    const result = await API.testConnection();
    return this.save(result.player);
  },
  async refreshIfConfigured(){
    return Settings.load().apiKey ? this.refresh() : this.current();
  },
};
