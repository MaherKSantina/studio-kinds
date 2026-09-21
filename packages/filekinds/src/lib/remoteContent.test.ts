/** The host's remote-content switch: off, nothing a document names is fetched from off this machine. */
import { describe, expect, it } from "vitest";
import { configureFileKinds, isRemoteUrl, remoteContentAllowed } from "../api";

describe("remote content", () => {
  it("is on until a host says otherwise", () => {
    expect(remoteContentAllowed()).toBe(true);
    configureFileKinds({ readFile: async () => ({ content: "", mime: "text/plain" }) as never, remoteContent: false });
    expect(remoteContentAllowed()).toBe(false);
    configureFileKinds({ readFile: async () => ({ content: "", mime: "text/plain" }) as never, remoteContent: true });
    expect(remoteContentAllowed()).toBe(true);
  });

  it("a remote URL is http(s) to anything but this machine", () => {
    expect(isRemoteUrl("https://img.example.com/a.jpg")).toBe(true);
    expect(isRemoteUrl("http://example.com")).toBe(true);
    expect(isRemoteUrl("http://127.0.0.1:9250/ask")).toBe(false);
    expect(isRemoteUrl("http://localhost:9260/studio/")).toBe(false);
    expect(isRemoteUrl("studio-local://file/a.png")).toBe(false);
    expect(isRemoteUrl("/Design/shot.png")).toBe(false);
    expect(isRemoteUrl("data:image/png;base64,AAAA")).toBe(false);
  });
});
