/**
 * Small, safe Markdown renderer for repository-controlled documentation.
 * Raw HTML is deliberately rendered as text rather than interpreted.
 */
function isBlockStart(lines, index){
  const line = lines[index] ?? "";
  const next = lines[index + 1] ?? "";
  return !line.trim() || /^#{1,6}\s+/.test(line) || /^```/.test(line) || /^>\s?/.test(line) ||
    /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line) || /^(?:---+|\*\*\*|___)\s*$/.test(line) ||
    (line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next));
}

function slug(text){
  return text.toLocaleLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-");
}

function safeUrl(rawUrl, baseUrl, { image = false } = {}){
  try {
    if (rawUrl.startsWith("#")) return rawUrl;
    const url = new URL(rawUrl, baseUrl);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    if (image && url.protocol === "mailto:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function appendInline(container, text, baseUrl){
  const tokenPattern = /(!?\[[^\]]*\]\([^)]*\)|`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
  let index = 0;
  for (const match of text.matchAll(tokenPattern)) {
    container.append(document.createTextNode(text.slice(index, match.index)));
    const token = match[0];
    const imageMatch = token.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)$/);
    const linkMatch = token.match(/^\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)$/);
    if (imageMatch) {
      const imageUrl = safeUrl(imageMatch[2], baseUrl, { image: true });
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = imageMatch[1];
        container.append(image);
      } else {
        container.append(document.createTextNode(token));
      }
    } else if (linkMatch) {
      const linkUrl = safeUrl(linkMatch[2], baseUrl);
      if (linkUrl) {
        const link = document.createElement("a");
        link.href = linkUrl;
        link.textContent = linkMatch[1];
        if (!linkUrl.startsWith("#") && new URL(linkUrl, baseUrl).origin !== new URL(baseUrl).origin) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        container.append(link);
      } else {
        container.append(document.createTextNode(token));
      }
    } else if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      container.append(code);
    } else {
      const emphasis = document.createElement(token.startsWith("**") ? "strong" : "em");
      appendInline(emphasis, token.startsWith("**") ? token.slice(2, -2) : token.slice(1, -1), baseUrl);
      container.append(emphasis);
    }
    index = match.index + token.length;
  }
  container.append(document.createTextNode(text.slice(index)));
}

function tableCells(line){
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

/** Renders supported Markdown to a document fragment without injecting HTML. */
export function renderMarkdown(markdown, { baseUrl = window.location.href } = {}){
  const fragment = document.createDocumentFragment();
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const element = document.createElement(`h${heading[1].length}`);
      element.id = slug(heading[2]);
      appendInline(element, heading[2], baseUrl);
      fragment.append(element);
      index += 1;
      continue;
    }
    if (/^(?:---+|\*\*\*|___)\s*$/.test(line)) {
      fragment.append(document.createElement("hr"));
      index += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) codeLines.push(lines[index++]);
      if (index < lines.length) index += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      if (language) code.dataset.language = language;
      code.textContent = codeLines.join("\n");
      pre.append(code);
      fragment.append(pre);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quoteLines.push(lines[index++].replace(/^>\s?/, ""));
      const quote = document.createElement("blockquote");
      const paragraph = document.createElement("p");
      appendInline(paragraph, quoteLines.join("\n"), baseUrl);
      quote.append(paragraph);
      fragment.append(quote);
      continue;
    }
    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const list = document.createElement(ordered ? "ol" : "ul");
      const matcher = ordered ? /^\d+\.\s+(.+)$/ : /^[-*+]\s+(.+)$/;
      while (index < lines.length) {
        const item = lines[index].match(matcher);
        if (!item) break;
        const row = document.createElement("li");
        appendInline(row, item[1], baseUrl);
        list.append(row);
        index += 1;
      }
      fragment.append(list);
      continue;
    }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? "")) {
      const table = document.createElement("table");
      const header = document.createElement("thead");
      const headerRow = document.createElement("tr");
      tableCells(line).forEach((cell) => {
        const column = document.createElement("th");
        appendInline(column, cell, baseUrl);
        headerRow.append(column);
      });
      header.append(headerRow);
      table.append(header);
      index += 2;
      const body = document.createElement("tbody");
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const row = document.createElement("tr");
        tableCells(lines[index]).forEach((cell) => {
          const column = document.createElement("td");
          appendInline(column, cell, baseUrl);
          row.append(column);
        });
        body.append(row);
        index += 1;
      }
      table.append(body);
      fragment.append(table);
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && !isBlockStart(lines, index)) paragraphLines.push(lines[index++]);
    const paragraph = document.createElement("p");
    appendInline(paragraph, paragraphLines.join("\n"), baseUrl);
    fragment.append(paragraph);
  }
  return fragment;
}

export function readmeUrl(locationHref = window.location.href){
  return new URL("README.md", new URL("./", locationHref)).href;
}
