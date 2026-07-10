/**
 * Creates a Torn-hosted item image without requiring another API request.
 */
export function createItemImage(item, { size = "small", className = "" } = {}){
  const image = document.createElement("img");
  image.className = `tct-item-image ${className}`.trim();
  image.src = `https://www.torn.com/images/items/${encodeURIComponent(item.id)}/${size}.png`;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.addEventListener("error", ()=>{
    image.hidden = true;
  }, { once: true });
  return image;
}
