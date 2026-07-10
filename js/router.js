window.TCT.router = {
  async load(page){
    const response = await fetch(`pages/${page}.html`);
    if(!response.ok){
      document.getElementById("content").innerHTML =
        `<div class="card"><h2>Error</h2><p>Unable to load ${page}.</p></div>`;
      return;
    }

    document.getElementById("content").innerHTML = await response.text();

    document.getElementById("pageTitle").textContent =
      page.charAt(0).toUpperCase()+page.slice(1);

    document.querySelectorAll(".nav-button").forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.page===page);
    });

    TCT.currentPage = page;
  }
};
