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
    expect(host.textContent).toContain("4 written inline");

    // An event opens; its content, written in the book, renders by its kind (a brief).
    await act(async () => { button(host, "button.event", "We incorporate").click(); });
    expect(host.textContent).toContain("hold the name for 60 days");
    expect(host.textContent).toContain("written here");

    // Unanswered, a written set shows the rule's process and asks for the answer.
    await act(async () => { button(host, "button.event", "Somebody pays us").click(); });
    expect(host.textContent).toContain("Answer What are we? to see this.");
    expect(host.textContent).not.toContain("Into the joint account");
    // An answer taken picks the member, hides the event its rule makes n/a, and writes nothing.
    await act(async () => { button(host, "button.pill", "A partnership").click(); });
    expect(host.textContent).toContain("Into the joint account");
    expect(host.textContent).not.toContain("Into the company account");
    expect([...host.querySelectorAll("button.event")].map((b) => b.textContent)).not.toContain("We incorporate");
    expect(host.querySelector("textarea")!.value).not.toContain("view:");

    // A nested written book walks inside its panel.
    await act(async () => { button(host, "button.event", "The tax office audits us").click(); });
    expect(host.textContent).toContain("An audit, as a book of its own");
    expect(host.textContent).toContain("The letter arrives");

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
