/**
 * The `.page` kind — AN HTML PAGE MADE FROM ITS OWN DATA: a Nunjucks template,
 * the model it renders and the partials it names, all in one file. Opened, the
 * page renders INSIDE a sandboxed frame (scripts allowed, the host's origin
 * withheld — the frame an `.html` file opens in): the frame is handed the
 * engine, the template, the partials and the model, renders them, and replaces
 * itself with the output. A template can reach JavaScript, so it runs where
 * JavaScript cannot reach the Studio.
 *
 *   title: Team roster
 *   model:                          # the template's variables, by name
 *     team: Platform
 *     people: [{name: Ada, role: Lead}]
 *   partials:                       # what include / import / from / extends name
 *     card: <li>{{ person.name }}</li>
 *   template: |
 *     <h1>{{ team }}</h1>
 *     <ul>{% for person in people %}{% include "card" %}{% endfor %}</ul>
 *
 * The parser is lenient — a half-written file still renders — and mirrors the
 * checker (`python/studio_kinds/kinds/page.py`): a model that is not a mapping
 * is none here, and a partial that is not text is dropped here and named there.
 * The model is read with YAML's core schema, so a date stays the text written.
 */
import yaml from "js-yaml";

export interface PageDoc {
  /** "Page" when absent — the frame's accessible name; not drawn. */
  title: string;
  description?: string;
  /** The template's variables, by name — the YAML as written. */
  model: Record<string, unknown>;
  /** Every partial that is text, by the name `include` / `import` / `from` / `extends` use. */
  partials: Record<string, string>;
  template: string;
}

/** What the frame renders: a template, the partials it names and the model it is handed — a `.page`,
 *  or a `.views` page view with the view's items as its model. */
export type PageRender = Pick<PageDoc, "template" | "partials" | "model">;

/** YAML's core schema, with merge keys: a date stays the text it is written as. (js-yaml exports its
 *  `types`; @types/js-yaml does not declare them.) */
const SCHEMA = yaml.CORE_SCHEMA.extend({ implicit: [(yaml as typeof yaml & { types: { merge: yaml.Type } }).types.merge] });

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

/** Lenient parse — never throws; an unparseable file opens as an empty page. */
export function parsePage(text: string): PageDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text, { schema: SCHEMA })); } catch { /* unparseable opens empty */ }
  const partials: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(raw.partials))) if (typeof v === "string") partials[k] = v;
  return {
    title: str(raw.title) || "Page",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    model: rec(raw.model),
    partials,
    template: str(raw.template) ?? "",
  };
}

/** The checker's summary line, for stories and counts: `2 variables · 1 partial · 7 lines`. */
export function pageSummary(doc: PageDoc): string {
  const lines = doc.template.trim() ? doc.template.trim().split(/\r?\n/).length : 0;
  const n = Object.keys(doc.model).length;
  const p = Object.keys(doc.partials).length;
  return `${n} variable${n === 1 ? "" : "s"} · ${p} partial${p === 1 ? "" : "s"} · ${lines} line${lines === 1 ? "" : "s"}`;
}

/**
 * The code that renders a page, as the source the frame runs: `renderPage(nunjucks, page)` gives
 * `{ html }` or `{ error }`. The partials are the environment's only templates — a name the page does
 * not hold is "template not found" — output is escaped unless a filter says `safe`, and a
 * `<!doctype html>` goes first when the output starts with none. The tests run this same source
 * against the engine in Node.
 */
export const RENDER_PAGE = `function renderPage(nunjucks, page) {
  var partials = page.partials || {};
  var own = Object.prototype.hasOwnProperty;
  var env = new nunjucks.Environment({
    getSource: function (name) {
      return own.call(partials, name) ? { src: partials[name], path: name, noCache: true } : null;
    }
  }, { autoescape: true });
  try {
    var html = new nunjucks.Template(page.template || "", env, "template", true).render(page.model || {});
    return { html: /^\\s*<!doctype/i.test(html) ? html : "<!doctype html>\\n" + html };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}`;

/** Runs in the frame once it has parsed: renders, tells the pane how it went (with the token the pane
 *  gave it), and on success replaces the frame's document with the page. */
const BOOT = `function (renderPage) {
  var page = JSON.parse(document.getElementById("page").textContent);
  function tell(verdict) { verdict.studioPage = page.token; parent.postMessage(verdict, "*"); }
  addEventListener("DOMContentLoaded", function () {
    if (typeof nunjucks === "undefined") { tell({ error: "The page's engine did not load." }); return; }
    var out = renderPage(nunjucks, page);
    if (out.error != null) { tell({ error: out.error }); return; }
    tell({ rendered: true });
    document.open();
    document.write(out.html);
    document.close();
  });
}`;

/**
 * The frame's own document: the engine (`engineUrl`, a script URL — the view hands it Nunjucks' browser
 * build as a data URL), the page as JSON, and the code that renders it. `token` comes back with the
 * verdict, so a frame the pane has moved on from is not heard. Nothing in the page is written as markup
 * here: the JSON's `<` is escaped, so no text of the page can close its script.
 */
export function pageFrame(doc: PageRender, engineUrl: string, token: string): string {
  const page = JSON.stringify({ token, template: doc.template, partials: doc.partials, model: doc.model })
    .replace(/</g, "\\u003c");
  return [
    "<!doctype html>",
    '<meta charset="utf-8">',
    `<script src="${engineUrl}"></script>`,
    `<script type="application/json" id="page">${page}</script>`,
    `<script>(${BOOT})(${RENDER_PAGE});</script>`,
  ].join("\n");
}

/**
 * The engine's message, as the pane shows it: one line per step of the chain — the template or
 * partial in brackets, with its line and column when the engine gives them, then what it refused —
 * without the engine's repeated wrapping, and at most a dozen lines (a partial that includes itself
 * chains without end).
 */
export function pageError(message: string): string {
  const lines: string[] = [];
  for (const raw of message.split(/\r?\n/)) {
    const line = raw.trim().replace(/^Template render error:\s*/, "").replace(/^Error:\s*/, "");
    if (line && line !== lines[lines.length - 1]) lines.push(line);
  }
  return lines.length > 12 ? [...lines.slice(0, 12), "…"].join("\n") : lines.join("\n");
}
