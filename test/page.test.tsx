// @vitest-environment jsdom
/**
 * The page, mounted for real: the example renders, is checked, and walks.
 * What a browser would show, without a server.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import App from "../src/web/App";

const button = (host: HTMLElement, selector: string, text: string): HTMLButtonElement => {
  const found = [...host.querySelectorAll<HTMLButtonElement>(selector)].find((b) => b.textContent?.includes(text));
  if (!found) throw new Error(`no ${selector} with "${text}"`);
  return found;
};

describe("the page", () => {
  it("renders the example, checks it, walks it, and re-checks as the text changes", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<App />); });

    // Checked and rendered on arrival.
    expect(host.textContent).toContain("A tiny venture");
    expect(host.textContent).toContain("Valid");
    expect(host.textContent).toContain("5 written inline");
    expect(host.textContent).toContain("1 file entry not checked");

    // An event opens; its content, written in the book, renders by its kind (a brief).
    await act(async () => { button(host, "button.event", "We incorporate").click(); });
    expect(host.textContent).toContain("Reserve the name");
    expect(host.textContent).toContain("written here");

    // An answer taken: the written set shows the member the answer picks, and a topic comes live.
    await act(async () => { button(host, "button.pill", "A company").click(); });
    await act(async () => { button(host, "button.event", "Somebody pays us").click(); });
    expect(host.textContent).toContain("Into the company account");
    expect(host.textContent).toContain("While we are a company");
    expect(host.textContent).not.toContain("Into the personal account");

    // A nested written book walks inside its panel; a file beside the book is named, not read.
    await act(async () => { button(host, "button.event", "The tax office audits us").click(); });
    expect(host.textContent).toContain("An audit, as a book of its own");
    expect(host.textContent).toContain("Are the records in one place?");
    expect(host.textContent).toContain("audits/last-time.md");

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
});
