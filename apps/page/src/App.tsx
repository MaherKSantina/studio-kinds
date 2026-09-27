/**
 * The page: the document as YAML on the left, what it means on the right.
 *
 * Everything happens in the browser. The text is rendered on every keystroke by the Studio's own
 * renderer for the kind; the one check here is whether it reads as YAML — the rules are
 * `studio-check`'s, on a machine. Nothing is fetched, sent, stored or remembered. Opening a file
 * reads it here, with FileReader.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { SidePanel } from "crosscut";
import { OFFERED, kindForFile, startFor, templateFor, yamlStatus } from "./kinds";
import Preview from "./Preview";
import Reference, { type ReferenceKind } from "./Reference";

const REPO = "https://github.com/MaherKSantina/studio-kinds";
const FIRST = { kind: "playbook", ...startFor("playbook") };

export default function App() {
  const [kind, setKind] = useState(FIRST.kind);
  const [text, setText] = useState<string>(FIRST.text);
  const [name, setName] = useState(FIRST.name);
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
  const status = useMemo(() => yamlStatus(kind, text), [kind, text]);
  // A reference, in a dialog: the kind's book (how it works, walked), its schema (the field table), or the skill.
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
  // A kind picked from the menu opens its example from `examples/`, or its template when it has none.
  const pick = (k: string) => {
    const start = startFor(k);
    setKind(k);
    setText(start.text);
    setName(start.name);
  };
  const fresh = () => {
    const t = templateFor(kind);
    setText(t.text);
    setName(t.name);
  };

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="bar">
        <span className="brand">studio-kinds</span>
        <label className="field">
          kind{" "}
          <select value={kind} onChange={(e) => pick(e.target.value)} aria-label="The kind">
            {OFFERED.map((k) => <option key={k.ext} value={k.ext}>{k.label} (.{k.ext})</option>)}
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
        <button type="button" title="skills/studio-files/SKILL.md — the guide as a skill for Claude.ai, Cowork and Claude Code; copy it from the dialog"
                onClick={() => setReference("skill")}>Skill</button>
        <span className="name muted">{shownName}</span>
        <span className="grow" />
        {status && (
          <span className={`status ${status.ok ? "ok" : "bad"}`} title={status.ok ? "The text reads as YAML; the kind's rules are studio-check's" : status.message}>
            {status.ok ? "YAML ok" : "YAML error"}
          </span>
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
          {status && !status.ok && <div className="problems bad"><b>Not YAML</b> <span className="muted">· {status.message}</span></div>}
          <div className="doc"><Preview name={shownName} text={text} /></div>
        </section>
        <Reference kind={kind} open={reference} onClose={() => setReference(null)} />
      </main>

      <footer className="muted">
        Everything runs in this page. Nothing you paste or open is sent, stored or remembered — reload and it is gone.
        The view is the Studio's own; the rules are the checker's: <code>pip install studio-kinds</code>, then <code>studio-check &lt;file&gt;</code>.
      </footer>
    </div>
  );
}
