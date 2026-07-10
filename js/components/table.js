/**
 * Reusable table component (v1)
 */
export function createTable(columns, data){
    const table=document.createElement("table");
    table.className="tct-table";

    const thead=document.createElement("thead");
    const tr=document.createElement("tr");

    columns.forEach(col=>{
        const th=document.createElement("th");
        th.textContent=col.label;
        th.style.cursor="pointer";
        th.onclick=()=>{
            data.sort((a,b)=>{
                const av=a[col.key], bv=b[col.key];
                if(typeof av==="number") return av-bv;
                return String(av).localeCompare(String(bv));
            });
            table.replaceWith(createTable(columns,data));
        };
        tr.appendChild(th);
    });

    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody=document.createElement("tbody");
    data.forEach(row=>{
        const tr=document.createElement("tr");
        columns.forEach(col=>{
            const td=document.createElement("td");
            td.textContent=row[col.key] ?? "";
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    return table;
}
