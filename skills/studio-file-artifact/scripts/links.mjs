#!/usr/bin/env node
/**
 * Remember which artifact was made from which file, so rendering the same file
 * again republishes to the same link and a link already shared keeps working.
 *
 *   node links.mjs get <file>                  prints the artifact URL, or nothing
 *   node links.mjs set <file> <url> "<title>"  records it
 *
 * Kept in ~/.claude/studio-file-artifact/links.json, keyed by the file's absolute
 * path (case-folded on Windows, where paths are case-insensitive).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const dir = join(homedir(), ".claude", "studio-file-artifact");
const store = join(dir, "links.json");

const load = () => {
  try {
    return JSON.parse(readFileSync(store, "utf8"));
  } catch {
    return {};
  }
};
const keyOf = (file) => {
  const abs = resolve(file).replace(/\\/g, "/");
  return process.platform === "win32" ? abs.toLowerCase() : abs;
};

const [cmd, file, url, title] = process.argv.slice(2);

if (cmd === "get" && file) {
  const hit = load()[keyOf(file)];
  if (hit && hit.url) console.log(hit.url);
} else if (cmd === "set" && file && url) {
  const links = load();
  links[keyOf(file)] = { url, title: title || "", updated: new Date().toISOString() };
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(store, JSON.stringify(links, null, 2) + "\n");
  console.log(`remembered ${url} for ${keyOf(file)}`);
} else {
  console.error('usage: node links.mjs get <file>\n       node links.mjs set <file> <url> "<title>"');
  process.exit(1);
}
