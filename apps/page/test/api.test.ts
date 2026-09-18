import { describe, expect, it } from "vitest";
import { handle } from "../functions/api/check";

const post = (url: string, body: string, headers: Record<string, string> = {}) =>
  handle(new Request(url, { method: "POST", body, headers }));

describe("POST /api/check", () => {
  it("checks the body as the kind in the query, and never caches", async () => {
    const res = await post("http://x/api/check?kind=playbook", "version: 2\ntitle: t\n");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const r = await res.json();
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("playbook");
    expect(r.version).toBe(2);
  });

  it("takes JSON {kind, text} too, and an X-Kind header", async () => {
    const res = await post("http://x/api/check", JSON.stringify({ kind: "brief", text: "title: t\nsections: [{title: a}]" }),
      { "content-type": "application/json" });
    const r = await res.json();
    expect(r.ok).toBe(true);
    expect(r.summary).toBe("1 section");
    const h = await post("http://x/api/check", "# hi", { "x-kind": "md" });
    expect((await h.json()).kind).toBe("md");
  });

  it("reports problems with 200 — the check ran", async () => {
    const res = await post("http://x/api/check?kind=playbook", "title: [oops");
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.ok).toBe(false);
    expect(r.problems[0].message).toMatch(/^YAML:/);
  });

  it("refuses a missing or unknown kind, and bad JSON", async () => {
    expect((await post("http://x/api/check", "title: t")).status).toBe(400);
    const unknown = await post("http://x/api/check?kind=frame", "x: 1");
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).problems[0].message).toMatch(/not a kind/);
    const bad = await post("http://x/api/check", "{nope", { "content-type": "application/json" });
    expect(bad.status).toBe(400);
  });

  it("answers OPTIONS for CORS, GET with the kinds, and nothing else", async () => {
    const o = await handle(new Request("http://x/api/check", { method: "OPTIONS" }));
    expect(o.status).toBe(204);
    expect(o.headers.get("access-control-allow-methods")).toContain("POST");
    const g = await handle(new Request("http://x/api/check"));
    expect((await g.json()).kinds).toEqual(["playbook", "brief", "guide", "md"]);
    const p = await handle(new Request("http://x/api/check", { method: "PUT", body: "x" }));
    expect(p.status).toBe(405);
  });
});
