loadPage(pages[page].render());

document.getElementById("sidebarToggle").onclick = () => {
  document.getElementById("app").classList.toggle("collapsed");
};
