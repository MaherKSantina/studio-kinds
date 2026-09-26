/** GOLDEN RULES for a page — a Nunjucks template and the model it renders, read leniently, rendered by the frame's own code. */
import { describe, expect, it } from "vitest";
import nunjucks from "nunjucks";
import { pageError, pageFrame, pageSummary, parsePage, RENDER_PAGE } from "./pageDoc";
import { fileTemplate } from "./fileTemplates";

/** The conformance corpus the checker is held to — the same files, read here. */
const CASES = import.meta.glob("../../../../conformance/page/*.page", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const VERDICTS = import.meta.glob("../../../../conformance/page/*.page.expected.json", { import: "default", eager: true }) as Record<string, { ok: boolean; summary?: string }>;
const TEMPLATE = CASES["../../../../conformance/page/template.page"];
const OK = CASES["../../../../conformance/page/ok.page"];

/** The frame's code, run against the engine in Node. */
const renderPage = new Function(`return ${RENDER_PAGE}`)() as (
  engine: typeof nunjucks,
  page: { template: string; partials?: Record<string, string>; model?: Record<string, unknown> },
) => { html?: string; error?: string };
const render = (text: string) => renderPage(nunjucks, parsePage(text));

describe("parsing", () => {
  it("reads the title, the model as written, the partials that are text and the template", () => {
    const d = parsePage(`
title: Roster
description: One line.
model:
  since: 2026-10-01
  count: 3
  base: &b {x: 1}
  merged:
    <<: *b
    y: 2
partials:
  row: <li>{{ r }}</li>
  count: 3
template: <h1>{{ count }}</h1>
`);
    expect(d.title).toBe("Roster");
    expect(d.description).toBe("One line.");
    expect(d.model).toEqual({ since: "2026-10-01", count: 3, base: { x: 1 }, merged: { x: 1, y: 2 } });
    expect(d.partials).toEqual({ row: "<li>{{ r }}</li>" });
    expect(d.template).toBe("<h1>{{ count }}</h1>");
  });
  it("never throws: an unparseable, empty or non-mapping file is an empty page", () => {
    const empty = { title: "Page", model: {}, partials: {}, template: "" };
    expect(parsePage("model: {a: 1")).toEqual(empty);
    expect(parsePage("")).toEqual(empty);
    expect(parsePage("- a\n- b")).toEqual(empty);
    expect(parsePage("model: [a, b]\ntemplate: x").model).toEqual({});
  });
  it("starts a new file from the checker's template, the stem as its title", () => {
    expect(fileTemplate("/Pages/untitled.page")).toBe(TEMPLATE);
  });
  it("summarises every case of the corpus as the checker does", () => {
    const checked = Object.entries(VERDICTS).filter(([, v]) => v.summary !== undefined);
    expect(checked.length).toBeGreaterThanOrEqual(7);
    for (const [path, v] of checked) {
      expect(pageSummary(parsePage(CASES[path.replace(/\.expected\.json$/, "")])), path).toBe(v.summary);
    }
  });
});

describe("rendering, with the frame's own code", () => {
  it("renders every page the checker passes", () => {
    const passed = Object.entries(VERDICTS).filter(([, v]) => v.ok);
    expect(passed.length).toBeGreaterThanOrEqual(2);
    for (const [path] of passed) expect(render(CASES[path.replace(/\.expected\.json$/, "")]).error, path).toBeUndefined();
  });
  it("renders the template: the model's variables, a partial seeing the loop's, a doctype put first", () => {
    const html = render(TEMPLATE).html!;
    expect(html.startsWith("<!doctype html>\n<style>")).toBe(true);
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<li><b>First</b> — the first thing</li>");
    expect(html).toContain("<li><b>Second</b> — what follows it</li>");
  });
  it("extends a layout, imports macros, calls one with a block, and keeps a date as written", () => {
    const html = render(OK).html!;
    expect(html.match(/<!doctype html>/gi)).toHaveLength(1);
    expect(html).toContain("<h1>Platform <small>since 2026-10-01</small></h1>");
    expect(html).toContain('<section><h3>Links</h3><a href="/docs">docs</a><a href="/repo">repo</a><a href="/status">status</a></section>');
    expect(html).toContain('{% include "shown-as-text" %}');
  });
  it("escapes what the model says unless the template writes it safe", () => {
    const html = render(`model: {name: "<b>Ada</b>"}\ntemplate: "{{ name }}|{{ name | safe }}"`).html;
    expect(html).toBe("<!doctype html>\n&lt;b&gt;Ada&lt;/b&gt;|<b>Ada</b>");
  });
  it("gives the engine's message for a partial the page does not hold, a syntax error, an unknown filter", () => {
    expect(render(`template: '{% include "footer" %}'`).error).toContain("template not found: footer");
    expect(pageError(render(`template: "a\\n{% for x in xs %}{{ x }}{% endfo %}"`).error!)).toMatch(/^\(template\) \[Line 2, Column \d+\]\nunknown block tag: endfo$/);
    expect(pageError(render(`template: "{{ total | money }}"`).error!)).toBe("(template)\nfilter not found: money");
  });
});

describe("the frame's document", () => {
  it("loads the engine, carries the page as JSON no text of which can close a script, and the token", () => {
    const doc = parsePage(`model: {x: "</script><script>alert(1)</script>"}\ntemplate: "</script>{{ x }}"`);
    const frame = pageFrame(doc, "data:text/javascript,void 0", "t0k3n");
    expect(frame).toContain('<script src="data:text/javascript,void 0"></script>');
    expect(frame.match(/<\/script>/g)).toHaveLength(3);
    expect(frame).toContain('"token":"t0k3n"');
    expect(frame).toContain("\\u003c/script>");
    const json = frame.slice(frame.indexOf('id="page">') + 'id="page">'.length, frame.indexOf("</script>", frame.indexOf('id="page">')));
    expect(JSON.parse(json)).toEqual({ token: "t0k3n", template: doc.template, partials: {}, model: doc.model });
  });
});

describe("the engine's message", () => {
  it("drops the engine's repeated wrapping and caps a chain without end", () => {
    expect(pageError("(template)\n  Template render error: (template)\n  Error: template not found: nope")).toBe("(template)\ntemplate not found: nope");
    const loop = render(`partials: {loop: '{% include "loop" %}'}\ntemplate: '{% include "loop" %}'`).error!;
    const shown = pageError(loop).split("\n");
    expect(shown.length).toBeLessThanOrEqual(13);
  });
});
