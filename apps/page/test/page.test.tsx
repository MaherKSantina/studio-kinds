// @vitest-environment jsdom
/**
 * The page, mounted for real: the example is checked, and the Studio's own
 * renderer draws it — the walk, with the example's events on the rail.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import App from "../src/web/App";

// What the Studio's components expect of a browser and jsdom does not provide.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}

const button = (host: HTMLElement, selector: string, text: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll<HTMLButtonElement>(selector)].find((b) => b.textContent?.includes(text));
  if (!found) throw new Error(`no ${selector} with "${text}"`);
  return found;
};

const until = async (host: HTMLElement, text: string, ms = 8000) => {
  const t0 = Date.now();
  while (!host.textContent?.includes(text)) {
    if (Date.now() - t0 > ms) throw new Error(`"${text}" never appeared:\n${host.textContent?.slice(0, 400)}`);
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
};

describe("the page", () => {
  it("checks the example and renders it with the Studio's renderer, then re-checks as the text changes", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<App />); });

    // Checked on arrival.
    expect(host.textContent).toContain("Valid");
    expect(host.querySelector("textarea")!.value).toContain("A tiny venture");

    // Rendered by the real walk: the example's events reach the rail once the lazy renderer lands.
    await until(host, "We incorporate");
    expect(host.textContent).toContain("Somebody pays us");

    // The text is the truth: a broken document changes the verdict, nothing throws.
    const area = host.querySelector("textarea")!;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(area, "title: [oops");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("1 problem");
    expect(host.textContent).toContain("YAML:");

    root.unmount();
  });
  it("opens the kind's book and its schema over the preview, and comes back to the document", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<App />); });

    // The book: kinds/playbook/v2.playbook, walked by the real renderer in a dialog.
    await act(async () => { button(host, ".bar button", "How .playbook works").click(); });
    await until(document.body, "kinds/playbook/v2.playbook");
    await until(document.body, "The file is opened");
    await act(async () => { (document.body.querySelector("button[aria-label=Close]") as HTMLButtonElement).click(); });

    // The schema: the field table, in a dialog.
    await act(async () => { button(host, ".bar button", "Schema").click(); });
    await until(document.body, "kinds/playbook/v2.fields.yaml");
    expect(document.body.textContent).toContain("events[].content.kind");
    await act(async () => { (document.body.querySelector("button[aria-label=Close]") as HTMLButtonElement).click(); });

    // The pasted document, untouched underneath.
    expect(host.textContent).toContain("Valid");
    expect(host.querySelector("textarea")!.value).toContain("A tiny venture");
    root.unmount();
  });
});
