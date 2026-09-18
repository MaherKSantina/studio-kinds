/**
 * The page: the document as YAML on the left, what it means on the right.
 *
 * Everything happens in the browser. The text is checked on every keystroke
 * by the same `check` the endpoint runs, and rendered by the Studio's own
 * renderer for the kind; nothing is fetched, sent, stored or remembered.
 * Opening a file reads it here, with FileReader.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { SidePanel } from "crosscut";
import { fileTemplate } from "filekinds";
import example from "../../../../examples/venture.playbook?raw";
import { OFFERED, check, kindForFile } from "../check";
import Preview from "./Preview";
import Problems from "./Problems";
import Reference, { type ReferenceKind } from "./Reference";

const REPO = "https://github.com/MaherKSantina/studio-kinds";

export default function App() {
  const [kind, setKind] = useState("playbook");
  const [text, setText] = useState<string>(example);
  const [name, setName] = useState("venture.playbook");
  // Phones show one pane at a time; wide screens show both and ignore this.
  const [pane, setPane] = useState<"source" | "preview">("preview");
  // A phone shows one pane at a time, so there is no separator to drag there.
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 760px)").matches);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 760px)");
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const result = useMemo(() => check(kind, text), [kind, text]);
  // The kind's reference, in a dialog: its book (how it works, walked) or its schema (the field table).
  const [reference, setReference] = useState<ReferenceKind | null>(null);
  // The renderer is picked by the name's extension; a kind chosen from the menu renames the document.
  const shownName = name.endsWith(`.${kind}`) ? name : `${name.replace(/\.[^.]+$/, "")}.${kind}`;

  const load = (file: File) => {
    file.text().then((t) => {
      const k = kindForFile(file.name);
      if (k) setKind(k);
      setText(t);
      setName(file.name);
    });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) load(f);
  };
  const fresh = () => {
    setText(fileTemplate(`untitled.${kind}`, "untitled"));
    setName(`untitled.${kind}`);
  };

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="bar">
        <span className="brand">studio-kinds</span>
        <label className="field">
          kind{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(OFFERED).map(([k, d]) => <option key={k} value={k}>{d.label} (.{d.extension})</option>)}
          </select>
        </label>
        <button type="button" onClick={() => input.current?.click()}>Open a file…</button>
        <input ref={input} type="file" hidden
               onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
        <button type="button" onClick={fresh}>Start from the template</button>
        <button type="button" title={`kinds/${kind}/v<N>.playbook — the playbook that explains how .${kind} works`}
                onClick={() => setReference("book")}>How .{kind} works</button>
        <button type="button" title={`kinds/${kind}/v<N>.fields.yaml — every field of .${kind}, its type and what it is`}
                onClick={() => setReference("schema")}>Schema</button>
        <span className="name muted">{shownName}</span>
        <span className="grow" />
        <span className={`status ${result.ok ? "ok" : "bad"}`}>
          {result.ok ? "valid" : `${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}`}
        </span>
        {result.version !== undefined && (
          <span className="badge" title="The version the document is read as">v{result.version}</span>
        )}
        <a className="muted" href={REPO} target="_blank" rel="noreferrer">source</a>
      </header>

      <div className="tabs">
        <button type="button" className={pane === "source" ? "on" : ""} onClick={() => setPane("source")}>Source</button>
        <button type="button" className={pane === "preview" ? "on" : ""} onClick={() => setPane("preview")}>Preview</button>
      </div>

      <main className={`split show-${pane}`}>
        {/* The source pane is the same resizable side panel the Studio's walk uses for its rail:
            drag the separator, double-click it to reset, collapse it with the chevron. */}
        {/* No storageKey: the width lives for the session only — the page keeps nothing, localStorage included. */}
        <SidePanel side="left" defaultWidth={520} minWidth={280} maxWidth={1100}
                   disabled={narrow} className="source">
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
                    aria-label="The document, as YAML" />
        </SidePanel>
        <section className="preview">
          <Problems result={result} />
          <div className="doc"><Preview name={shownName} text={text} /></div>
        </section>
        <Reference kind={kind} open={reference} onClose={() => setReference(null)} />
      </main>

      <footer className="muted">
        Everything runs in this page. Nothing you paste or open is sent, stored or remembered — reload and it is gone.
        The view is the Studio's own; the check is the same <code>check(kind, text)</code> that <code>POST /api/check</code> runs, for tools that cannot open a page.
      </footer>
    </div>
  );
}
