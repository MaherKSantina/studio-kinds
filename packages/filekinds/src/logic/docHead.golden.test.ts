import { describe, expect, it } from "vitest";
import { hasTopKey, readTopKey, writeTopKey, yamlScalar } from "../lib/docHead";

describe("document head — title/description by line replacement", () => {
  const doc = "# a comment\ntitle: Old\ndescription: One line\nitems:\n  - title: nested\n";

  it("reads the top-level line only, never a nested one", () => {
    expect(readTopKey(doc, "title")).toBe("Old");
    expect(readTopKey(doc, "description")).toBe("One line");
    expect(readTopKey("items:\n  - title: nested\n", "title")).toBe("");
  });

  it("unquotes both YAML quoting styles", () => {
    expect(readTopKey('title: "A: B"', "title")).toBe("A: B");
    expect(readTopKey("title: 'it''s'", "title")).toBe("it's");
  });

  it("replaces in place and leaves every other byte alone", () => {
    expect(writeTopKey(doc, "title", "New")).toBe("# a comment\ntitle: New\ndescription: One line\nitems:\n  - title: nested\n");
  });

  it("quotes only when it must", () => {
    expect(yamlScalar("plain words")).toBe("plain words");
    expect(yamlScalar("a: b")).toBe('"a: b"');
    expect(yamlScalar(" padded")).toBe('" padded"');
    expect(yamlScalar("#x")).toBe('"#x"');
  });

  it("adds a missing description under the title, a missing title first", () => {
    expect(writeTopKey("title: T\nitems: []\n", "description", "D")).toBe("title: T\ndescription: D\nitems: []\n");
    expect(writeTopKey("items: []\n", "title", "T")).toBe("title: T\nitems: []\n");
    expect(writeTopKey("items: []\n", "description", "D")).toBe("description: D\nitems: []\n");
  });

  it("a value with replacement patterns survives the write verbatim", () => {
    expect(readTopKey(writeTopKey("title: x\n", "title", "$1 & $&"), "title")).toBe("$1 & $&");
  });

  it("hasTopKey tells a headed document from a plain one", () => {
    expect(hasTopKey(doc, "title")).toBe(true);
    expect(hasTopKey("# Just markdown\n\ntitle: not at column 0? it is\n", "title")).toBe(true);
    expect(hasTopKey("# Just markdown\n", "title")).toBe(false);
  });
});
