/**
 * STABLE NODE HANDLES — the copyable identifier for anything in the suite's
 * one shared store: `nodes:` + the entry's absolute path.
 *
 *   nodes:/Party DJ/Sep 9 HH.definition
 *   nodes:/Job Hunt/lead-etoro.node
 *   nodes:/memory/desk.memory
 *
 * The prefix names the STORE, not a tool: every studio is a lens over the
 * same `nodes.entries`, so one handle is enough for a person to point at a
 * thing and for an agent to know exactly where to read and write it. Paste
 * one into a chat and the receiving agent resolves it through the nodes
 * worker API — no guessing which of the ten tools owns it.
 */

export const NODE_HANDLE_PREFIX = "nodes:";

/** The handle for a store path. */
export const nodeHandleOf = (path: string): string => NODE_HANDLE_PREFIX + path;

/** The absolute path inside a handle, or null when the string isn't one.
 *  Lenient about surrounding whitespace — handles travel through chat. */
export function parseNodeHandle(s: string): string | null {
  const t = s.trim();
  if (!t.toLowerCase().startsWith(NODE_HANDLE_PREFIX)) return null;
  const p = t.slice(NODE_HANDLE_PREFIX.length).trim();
  return p.startsWith("/") && p.length > 1 ? p : null;
}

/**
 * Every handle mentioned in a blob of text, in order, de-duplicated.
 *
 * Store paths may contain spaces, so mid-sentence prose after a handle is
 * genuinely ambiguous. The boundary contract: a handle runs to the end of
 * its line, a quote, or a paren/bracket — put a spaced handle on its own
 * line or in quotes and it always extracts exactly.
 */
export function nodeHandlesIn(text: string): string[] {
  const out: string[] = [];
  const re = /nodes:(\/[^\n\r"'`()[\]]*)/gi;
  for (const m of text.matchAll(re)) {
    const p = m[1].replace(/[.,;:]+$/, "").trim();
    if (p.startsWith("/") && p.length > 1 && !out.includes(p)) out.push(p);
  }
  return out;
}
