#!/usr/bin/env node
/**
 * Start a page for one studio-kinds file: copy the viewer shell, embed the file
 * verbatim, and fill in its name, kind and the page title.
 *
 *   node prepare_page.mjs <file> <out.html> "<page title>"
 *
 * The file goes in as a JavaScript string literal. JSON.stringify makes it one;
 * escaping every "<" keeps a "</script>" or "<!--" inside the file from ending the
 * script early. Replacements use functions, not strings, so a "$&" or "$1" in the
 * file is kept as written rather than read as a replacement pattern.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [file, out, title] = process.argv.slice(2);
if (!file || !out || !title) {
  console.error('usage: node prepare_page.mjs <file> <out.html> "<page title>"');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(join(here, "..", "assets", "viewer-shell.html"), "utf8");
const text = readFileSync(file, "utf8").replace(/^﻿/, "");
const kind = extname(file).slice(1).toLowerCase();

const asJs = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
const asHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const fills = {
  __TITLE__: asHtml(title),
  __SOURCE_JSON__: asJs(text),
  __FILE_NAME_JSON__: asJs(basename(file)),
  __KIND_JSON__: asJs(kind),
};

let page = shell;
for (const [marker, value] of Object.entries(fills)) {
  if (!page.includes(marker)) {
    console.error(`the shell has no ${marker} — it has been edited; restore assets/viewer-shell.html`);
    process.exit(1);
  }
  page = page.replace(marker, () => value);
}

writeFileSync(out, page);
console.log(`wrote ${out}  (.${kind}, ${text.length} characters embedded)`);
