export function loadPage(html) {
  document.getElementById("content").innerHTML = html;
}

export function toast(message) {
  const div = document.createElement("div");

  div.className = "toast";

  div.textContent = message;

  document.getElementById("toastContainer").appendChild(div);

  setTimeout(() => {
    div.remove();
  }, 3000);
}
