/**
 * THE DOCUMENT HEAD — `title:` and `description:` at the top level of a YAML
 * document, read and written by TARGETED LINE REPLACEMENT rather than
 * parse→dump, so comments and formatting elsewhere in the file survive a
 * retitle. Every editor that shows the head as fields (the Studio's generic
 * editor, the playbook's authoring page) goes through here.
 */

/** A single-line YAML scalar, quoted only when it has to be. */
export const yamlScalar = (v: string): string => {
  const special = [":", "#", "'", '"', "\n", "\\"].some((c) => v.includes(c)) || v !== v.trim();
  return special ? JSON.stringify(v) : v;
};

const lineOf = (key: string) => new RegExp(`^${key}:[ \\t]*(.*)$`, "m");

/** Is there a top-level `key:` line at all? (Nested keys are indented and do not count.) */
export const hasTopKey = (content: string, key: string): boolean => lineOf(key).test(content);

/** The value of the top-level `key:` line, unquoted; "" when absent. */
export function readTopKey(content: string, key: string): string {
  const m = content.match(lineOf(key));
  if (!m) return "";
  const raw = m[1].trim();
  if (raw.startsWith('"')) {
    try { return String(JSON.parse(raw)); } catch { return raw; }
  }
  if (/^'.*'$/.test(raw)) return raw.slice(1, -1).replace(/''/g, "'");
  return raw;
}

/** The content with the top-level `key:` line set to `value` — replaced in
 *  place, or added: under the title line when there is one, else first. */
export function writeTopKey(content: string, key: string, value: string): string {
  const line = `${key}: ${yamlScalar(value)}`;
  const re = lineOf(key);
  // A function replacer: a value with `$&` or `$1` in it must land verbatim.
  if (re.test(content)) return content.replace(re, () => line);
  const title = key === "title" ? null : content.match(lineOf("title"));
  if (title && title.index !== undefined) {
    const at = title.index + title[0].length;
    return `${content.slice(0, at)}\n${line}${content.slice(at)}`;
  }
  return `${line}\n${content}`;
}
