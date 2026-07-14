import assert from "node:assert/strict";

class FakeNode {
  constructor(tagName = ""){ this.tagName = tagName; this.children = []; this.dataset = {}; }
  append(...children){ this.children.push(...children); }
  appendChild(child){ this.children.push(child); return child; }
}

globalThis.window = { location: { href: "https://example.github.io/TornCostTracker/" } };
globalThis.document = {
  createDocumentFragment: () => new FakeNode("fragment"),
  createElement: (tagName) => new FakeNode(tagName),
  createTextNode: (text) => ({ textContent: text }),
};

const { readmeUrl, renderMarkdown } = await import("./markdown-renderer.js");
const output = renderMarkdown([
  "# Heading",
  "",
  "- One",
  "- Two",
  "",
  "[Docs](docs/ARCHITECTURE.md) and [External](https://example.com)",
  "",
  "```js",
  "const value = 1;",
  "```",
  "",
  "<script>alert(1)</script>",
].join("\n"), { baseUrl: "https://example.github.io/TornCostTracker/" });

assert.equal(output.children[0].tagName, "h1");
assert.equal(output.children[1].tagName, "ul");
assert.equal(output.children[1].children.length, 2);
const paragraph = output.children[2];
const links = paragraph.children.filter((node) => node.tagName === "a");
assert.equal(links[0].href, "https://example.github.io/TornCostTracker/docs/ARCHITECTURE.md");
assert.equal(links[1].target, "_blank");
assert.equal(links[1].rel, "noopener noreferrer");
assert.equal(output.children[3].tagName, "pre");
assert.equal(output.children[3].children[0].textContent, "const value = 1;");
assert.equal(output.children[4].tagName, "p");
assert.equal(output.children[4].children.some((node) => node.tagName === "script"), false);
assert.equal(readmeUrl("https://example.github.io/TornCostTracker/index.html"), "https://example.github.io/TornCostTracker/README.md");

console.log("Markdown renderer deterministic tests passed.");
