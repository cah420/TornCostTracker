import { DataGrid } from "../components/data-grid.js";
import { ItemStore } from "../stores/items.js";

export default{
 route:"items",
 title:"Items",
 render(){
  const d=document.createElement("div");
  d.className="card";
  d.innerHTML=`<h2>Items</h2>
  <button id="refresh">Refresh Items</button>
  <div id="stats"></div>
  <input id="search" placeholder="Search..." style="width:100%;margin:10px 0;">
  <div id="progress"></div>
  <div id="table"></div>`;
  return d;
 },
 async mount(){
  const stats=document.getElementById("stats");
  const table=document.getElementById("table");
  const search=document.getElementById("search");
  const refreshButton=document.getElementById("refresh");
  const progress=document.getElementById("progress");
  const grid = new DataGrid({
   columns: [
    {label:"Item",key:"name",type:"text"},
    {label:"Qty",key:"quantity",type:"number",defaultSort:true},
    {label:"Category",key:"category",type:"text"},
   ],
   storageKey: "tct.grid.items.sort",
   emptyMessage: "No items found.",
  });
  table.replaceChildren(grid.element);

  const renderStats=()=>{
   const s=ItemStore.statistics();
   stats.innerHTML=`Unique Items: ${s.uniqueItems}<br>Total Quantity: ${s.totalQuantity}<br>Last Updated: ${s.lastUpdated?new Date(s.lastUpdated).toLocaleString():"Never"}`;
  };
  const renderRows=()=>grid.setRows(ItemStore.search(search.value));

  renderStats();
  renderRows();
  search.oninput=renderRows;
  refreshButton.onclick=async()=>{
    progress.textContent="Refreshing...";
    refreshButton.disabled=true;
    grid.setLoading(true, "Refreshing inventory...");
    try{
      await ItemStore.refresh(x=>{progress.textContent=`${x.category??""} ${x.current??""}/${x.total??""}`});
      progress.textContent="Complete";
      renderStats();
      renderRows();
    }catch(error){
      progress.textContent=`Refresh failed: ${error.message}`;
    }finally{
      grid.setLoading(false);
      refreshButton.disabled=false;
    }
  };
 }
};
