import {ItemStore} from "../stores/items.js";
import {createTable} from "../components/table.js";

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
  const render=(rows)=>{
   table.replaceChildren(createTable([
    {label:"Item",key:"name"},
    {label:"Qty",key:"quantity"},
    {label:"Category",key:"category"}],rows));
   const s=ItemStore.statistics();
   stats.innerHTML=`Unique Items: ${s.uniqueItems}<br>Total Quantity: ${s.totalQuantity}<br>Last Updated: ${s.lastUpdated?new Date(s.lastUpdated).toLocaleString():"Never"}`;
  };
  render(ItemStore.items());
  document.getElementById("search").oninput=e=>render(ItemStore.search(e.target.value));
  document.getElementById("refresh").onclick=async()=>{
    const p=document.getElementById("progress");
    p.textContent="Refreshing...";
    await ItemStore.refresh(x=>{p.textContent=`${x.category??""} ${x.current??""}/${x.total??""}`});
    p.textContent="Complete";
    render(ItemStore.items());
  };
 }
};
