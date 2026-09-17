/**
 * The walk: where we stand, what can happen, and what is true while it does.
 *
 * The rail on the left holds the answers taken (pills) and the events that can
 * arise here; the pane on the right shows what the open event shows, and the
 * topics live under these answers. Every answer is session-local: the text on
 * the left is the truth, and when it changes the walk starts again from what
 * the file says. Nothing is written anywhere.
 *
 * Content written in the book renders by its kind, here. A file beside the book
 * is named, not read — this page has no folder.
 */
import { useEffect, useMemo, useState } from "react";
import { toggleRef } from "../../kinds/decisionSpace";
import {
  applyRefs, contentKey, contentText, decisionRows, eventsAt, impliedLocks, isInline, parsePlaybook, pruneLocks,
  refOf, ruleFor, topicsAt, valuesOn, variantKey, variationOf,
  type PlaybookContent, type PlaybookDoc, type PlaybookEvent,
} from "../../kinds/playbookDoc";
import BriefView from "./BriefView";
import Markdown from "./Markdown";

const STATUS_TITLE: Record<string, string> = {
  ready: "we know what to do",
  gap: "it can happen and we have no answer",
  unseen: "nobody has looked at this here",
};

type Trail = { event: string; from?: string[]; locks: string[] }[];

/** A document written in the book, rendered by its kind. A written playbook walks on its own inside its panel. */
function Written({ kind, text, depth }: { kind: string; text: string; depth: number }) {
  switch (kind) {
    case "playbook": return <PlaybookView text={text} depth={depth + 1} />;
    case "brief": return <BriefView text={text} />;
    case "md": return <Markdown text={text} />;
    default: return <pre className="raw">{text}</pre>;
  }
}

function ContentPanel({ doc, entry, eff, at, depth, collapsed, onCollapse }: {
  doc: PlaybookDoc; entry: PlaybookContent; eff: string[];
  /** Where the entry sits (`event fund/2`) — what names a written entry with no key or label. */
  at: string;
  depth: number; collapsed: Set<string>; onCollapse: (id: string) => void;
}) {
  const c = variationOf(entry, eff);
  const id = contentKey(entry, at);
  if (c.missing.length) {
    const labels = c.missing.map((d) => doc.decisions.find((x) => x.key === d)?.label ?? d);
    return <p className="unanswered">Answer {labels.join(" and ")} to see this.</p>;
  }
  const inline = isInline(entry);
  // A keyed entry collapses by its key; a keyless file entry by the file shown; a keyless written one by its label or position.
  const shown = entry.key ?? (c.file || id);
  const open = !collapsed.has(shown);
  return (
    <div className="panel">
      <button type="button" className="panel-head" onClick={() => onCollapse(shown)}>
        <span className="caret">{open ? "▾" : "▸"}</span>
        <span className="panel-label">{entry.label ?? (inline ? id : c.file)}</span>
        <span className="muted panel-src">
          {inline ? `written here${c.segs.length ? ` · ${variantKey(c.segs)}` : ""}` : c.file}
        </span>
      </button>
      {open && (inline
        ? <div className="panel-body"><Written kind={entry.kind ?? "md"} text={contentText(entry, c.segs)} depth={depth} /></div>
        : <p className="filechip">A file beside the book: <code>{c.file}</code>. This page has no folder, so it is named, not shown.</p>)}
    </div>
  );
}

function EventDetail({ doc, event, eff, depth, collapsed, onCollapse, onDoor }: {
  doc: PlaybookDoc; event: PlaybookEvent; eff: string[]; depth: number;
  collapsed: Set<string>; onCollapse: (id: string) => void;
  onDoor: (event: PlaybookEvent, sets: string[]) => void;
}) {
  const rule = ruleFor(doc, event.key, eff);
  const content = event.content ?? [];
  return (
    <div className="event-detail">
      <div className="event-title">
        <span className={`glyph ${event.trigger}`}>{event.trigger === "chosen" ? "✋" : "⚡"}</span> {event.label}
      </div>
      {!!event.inputs?.length && (
        <table className="inputs">
          <thead><tr><th>{event.trigger === "chosen" ? "Needs" : "Captures"}</th><th>From</th><th>Why</th></tr></thead>
          <tbody>
            {event.inputs.map((i, n) => <tr key={n}><td>{i.input}</td><td>{i.from}</td><td>{i.why}</td></tr>)}
          </tbody>
        </table>
      )}
      {event.detail && <p className="detail">{event.detail}</p>}
      {!!rule?.sets?.length && (
        <button type="button" className="door" onClick={() => onDoor(event, rule.sets!)}>
          Take it — {rule.sets.join(", ")}
        </button>
      )}
      {content.length
        ? content.map((c, i) => (
            <ContentPanel key={i} doc={doc} entry={c} eff={eff} at={`event ${event.key}/${i}`}
                          depth={depth} collapsed={collapsed} onCollapse={onCollapse} />
          ))
        : rule?.process
          ? <Markdown text={rule.process} />
          : <p className="unanswered">
              {rule?.sets?.length ? "No prerequisite recorded for this door." : "No response recorded — this is a hole, not a nothing."}
            </p>}
      {rule?.note && <p className="muted note">{rule.note}</p>}
    </div>
  );
}

export default function PlaybookView({ text, depth = 0 }: { text: string; depth?: number }) {
  const doc = useMemo(() => parsePlaybook(text), [text]);
  const [locks, setLocks] = useState<string[]>(() => pruneLocks(doc, doc.view.locks ?? []));
  const [history, setHistory] = useState<Trail>(() => doc.view.history ?? []);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(doc.view.collapsed ?? []));
  const [open, setOpen] = useState<string | null>(null);

  // The text is the truth: a new document starts the walk again from what it says.
  useEffect(() => {
    setLocks(pruneLocks(doc, doc.view.locks ?? []));
    setHistory(doc.view.history ?? []);
    setCollapsed(new Set(doc.view.collapsed ?? []));
    setOpen(null);
  }, [doc]);

  // A decision with one available answer is taken automatically and never shown.
  const eff = useMemo(() => impliedLocks(doc, locks), [doc, locks]);
  const rows = useMemo(() => decisionRows(doc, eff), [doc, eff]);
  const events = useMemo(() => eventsAt(doc, eff), [doc, eff]);
  const topics = useMemo(() => topicsAt(doc, eff), [doc, eff]);
  const openEvent = open ? events.find((e) => e.key === open) : undefined;
  const empty = !doc.decisions.length && !doc.events.length && !doc.topics.length;
  const domains = [...new Set(events.map((e) => e.domain ?? ""))];

  const toggle = (ref: string) => setLocks(toggleRef(doc.decisions, locks, ref));
  const onCollapse = (id: string) => setCollapsed((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const onDoor = (e: PlaybookEvent, sets: string[]) => {
    const next = pruneLocks(doc, applyRefs(locks, sets));
    setHistory((h) => [...h, { event: e.key, from: locks, locks: next }]);
    setLocks(next);
  };
  // Going back truncates the trail; "start" is where the first event began.
  const jump = (i: number) => {
    const back = i < 0 ? (history[0]?.from ?? locks) : history[i].locks;
    setLocks(pruneLocks(doc, back));
    setHistory((h) => (i < 0 ? [] : h.slice(0, i + 1)));
  };
  const eventLabel = (key: string) => doc.events.find((e) => e.key === key)?.label ?? key;

  return (
    <div className={`pb${depth ? " nested" : ""}`}>
      <div className="pb-head">
        <span className="pb-title">{doc.title}</span>
        {doc.description && <span className="muted"> — {doc.description}</span>}
      </div>
      {empty ? <p className="muted">An empty playbook — no decisions, events or topics yet.</p> : (
        <div className="pb-body">
          <aside className="rail">
            {history.length > 0 && (
              <div className="trail">
                <h4>How we got here</h4>
                <div className="crumbs">
                  {history[0]?.from && (
                    <button type="button" className="crumb" onClick={() => jump(-1)} title="Back to before the first event">start</button>
                  )}
                  {history.map((h, i) => (
                    <span key={i}>
                      {" › "}
                      <button type="button" className={`crumb${i === history.length - 1 ? " here" : ""}`}
                              onClick={() => jump(i)}>{eventLabel(h.event)}</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {rows.length > 0 && (<>
              <h4>Where we are · {locks.length} of {rows.length} answered</h4>
              {rows.map(({ decision: d, depth: dd }) => (
                <div key={d.key} className="decision" style={{ marginLeft: dd * 12 }}>
                  <div className="dlabel" title={d.detail}>{d.label}</div>
                  <div className="pills">
                    {valuesOn(d, eff).map((v) => {
                      const ref = refOf(d.key, v.key);
                      const on = eff.includes(ref);
                      return (
                        <button type="button" key={v.key} className={`pill${on ? " on" : ""}`} title={v.detail}
                                onClick={() => toggle(ref)}>{v.label}</button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>)}

            {events.length > 0 && (<>
              <h4>What can happen</h4>
              {domains.map((dom) => (
                <div key={dom || "_"} className="domain">
                  {dom && <div className="domain-name">{dom}</div>}
                  {events.filter((e) => (e.domain ?? "") === dom).map((e) => {
                    const status = ruleFor(doc, e.key, eff)?.status ?? "unseen";
                    return (
                      <button type="button" key={e.key} className={`event${open === e.key ? " open" : ""}`}
                              onClick={() => setOpen(e.key)}>
                        <span className={`glyph ${e.trigger}`}
                              title={e.trigger === "chosen" ? "chosen — fires when we say so" : "imposed — arrives whether or not we are ready"}>
                          {e.trigger === "chosen" ? "✋" : "⚡"}
                        </span>
                        <span className="elabel">
                          {e.label}
                          {e.arity === "many" && <span className="rate"> ↻{e.rate ? ` ${e.rate}` : ""}</span>}
                        </span>
                        <span className={`dot ${status}`} title={STATUS_TITLE[status]} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </>)}
          </aside>

          <section className="detail">
            {openEvent
              ? <EventDetail doc={doc} event={openEvent} eff={eff} depth={depth}
                             collapsed={collapsed} onCollapse={onCollapse} onDoor={onDoor} />
              : !topics.length && <p className="muted">Take an event to see what it shows.</p>}
            {topics.length > 0 && (
              <div className="topics">
                {(topics.length > 1 || openEvent) && (
                  <h4>What is true here · {topics.length} topic{topics.length === 1 ? "" : "s"}</h4>
                )}
                {topics.map((t) => (
                  <div key={t.key} className="topic">
                    <div className="tlabel">
                      {t.label}{" "}
                      {!t.when?.length && (
                        <span className="muted" title="Always live — what it shows changes with the answers, but it never goes away">always</span>
                      )}
                    </div>
                    {t.content.length
                      ? t.content.map((c, i) => (
                          <ContentPanel key={i} doc={doc} entry={c} eff={eff} at={`topic ${t.key}/${i}`}
                                        depth={depth} collapsed={collapsed} onCollapse={onCollapse} />
                        ))
                      : <p className="muted">Nothing attached to this topic yet.</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
