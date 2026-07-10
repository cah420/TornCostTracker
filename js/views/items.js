import { DataGrid } from "../components/data-grid.js";
import { ItemStore } from "../stores/items.js";
import { ItemSyncService } from "../services/item-sync-service.js";
import { Events } from "../events.js";
import { ItemDetails } from "../components/ItemDetails/item-details.js";
import { SyncStatusPanel } from "../components/sync-status-panel.js";
import { createItemImage } from "../components/item-image.js";

const LOCATION_LABELS = {
 inventory: "Inventory",
 bazaar: "Bazaar",
 itemMarket: "Item Market",
 displayCase: "Display Case",
};

function locationText(item){
 return Object.entries(item.locations)
  .filter(([, location])=>location.quantity>0)
  .map(([key])=>LOCATION_LABELS[key] ?? key)
  .join(", ");
}

function itemCell(name, item){
 const content = document.createElement("div");
 content.className = "tct-item-cell";
 const label = document.createElement("span");
 label.textContent = name;
 content.append(createItemImage(item, { className: "tct-item-image--grid" }), label);
 return content;
}

let itemDetailsComponent = null;
let syncStatusComponent = null;

export default{
 route:"items",
 title:"Items",
 render(){
  const d=document.createElement("div");
  d.className="card";
  d.innerHTML=`<h2>Items</h2>
  <input id="search" placeholder="Search..." style="width:100%;margin:10px 0;">
  <div id="progress"></div>
  <div id="syncStatus"></div>
  <div class="tct-items-layout">
   <div id="table"></div>
   <div id="itemDetails"></div>
  </div>`;
  return d;
 },
 async mount(){
  const table=document.getElementById("table");
  const search=document.getElementById("search");
  const progress=document.getElementById("progress");
  itemDetailsComponent = new ItemDetails();
  const grid = new DataGrid({
   columns: [
    {label:"Item",key:"name",type:"text",renderCell:itemCell},
    {label:"Qty",key:"totalQuantity",type:"number",defaultSort:true},
    {label:"Location",key:"location",type:"text",value:locationText},
    {label:"Category",key:"category",type:"text"},
   ],
   storageKey: "tct.grid.items.sort",
   emptyMessage: "No items found.",
   onRowClick:(item)=>Events.emit("itemSelected",{item}),
  });
  table.replaceChildren(grid.element);
  document.getElementById("itemDetails").replaceChildren(itemDetailsComponent.element);
  const renderRows=()=>grid.setRows(ItemStore.search(search.value));
  const refreshItems=async()=>{
    progress.textContent="Refreshing...";
    grid.setLoading(true, "Synchronizing items...");
    try{
      await ItemSyncService.synchronize((update)=>{progress.textContent=update.message;});
      progress.textContent="Complete";
      renderRows();
    }catch(error){
      progress.textContent=`Refresh failed: ${error.message}`;
    }finally{
      grid.setLoading(false);
    }
  };
  syncStatusComponent = new SyncStatusPanel(
    ()=>ItemSyncService.state(),
    { onRefresh: refreshItems },
  );
  document.getElementById("syncStatus").replaceChildren(syncStatusComponent.element);

  renderRows();
  search.oninput=renderRows;
 },
 async destroy(){
  itemDetailsComponent?.destroy();
  syncStatusComponent?.destroy();
  itemDetailsComponent=null;
  syncStatusComponent=null;
 }
};
