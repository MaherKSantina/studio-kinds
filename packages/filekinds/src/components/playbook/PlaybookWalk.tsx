/**
 * Standing somewhere and looking around.
 *
 * There is no list of states to pick from, because a state is the ASSIGNMENT —
 * the answers currently taken. So the way you move is by answering a decision
 * differently, or by letting an event answer one for you. Both do the same
 * thing to the same field.
 *
 * Two panes: where we are (the rail), and what is true while you stand here
 * (the content). Content is a file chosen by the answers — markdown, a guide,
 * or another playbook, which walks on its own inside its panel and is handed
 * nothing from here — or a document written in the book itself, shown the
 * same way without a read.
 */
import { useEffect, useMemo, useState } from "react";
import { Box, Chip, CircularProgress, Stack, Tooltip, Typography } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import PanToolIcon from "@mui/icons-material/PanTool";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import { DecisionPills, EventRow, OneDList, PaneTrail, SidePanel, decide, resolveRef, type TrailPane } from "crosscut";
import { previewForPath } from "../../lib/filePreviews";
import { readVirtualDirectoryFile } from "../../api";
import { eventDetailRules } from "./eventDetailRules";
import {
  applyRefs, contentKey, contentPath, contentText, decisionRows, eventsAt, impliedLocks, isInline,
  parsePlaybook, pruneLocks, ruleFor, topicsAt, variantKey, variationOf, type PlaybookContent, type PlaybookDoc,
} from "../../lib/playbookDoc";

const CrosshairIcon = CenterFocusStrongIcon;
const UNSEEN = "#a16207";
const STATUS_FG: Record<string, string> = { ready: "#15803d", gap: "#dc2626" };
const NEUTRAL = "#6b7280";

/** A `by` entry whose answers are not all taken: what to do before answering (the rule's process), then which answers are wanted — rather than nothing. */
function Unanswered({ doc, decisions, process }: { doc: PlaybookDoc; decisions: string[]; process?: string }) {
  const labels = decisions.map((d) => doc.decisions.find((x) => x.key === d)?.label ?? d);
  const md = useMemo(() => previewForPath("process.md"), []);
  return (
    <Box sx={{ p: 1 }}>
      {!!process && (md
        ? <md.Renderer content={process} height="auto" />
        : <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap", color: "text.secondary" }}>{process}</Typography>)}
      <Typography sx={{ fontSize: 13, color: UNSEEN, fontStyle: "italic" }}>
        Answer {labels.join(" and ")} to see this.
      </Typography>
    </Box>
  );
}

function ContentPanel({ agentId, file, inline, id, label, open, onToggle, depth, lineage = [],
                        fill, bare, prefix, onDrill, onSubPanes }: {
  agentId?: string;
  /** The path the registry picks a renderer from — real, or synthetic (`inline.brief`) for content written in the book. */
  file: string;
  /** The text of an inline entry: no fetch, this IS the document. */
  inline?: string;
  /** What this panel is on the lineage chain: the resolved path, or the entry's key when inline. */
  id?: string;
  label?: string; open: boolean; onToggle: () => void;
  depth: number;
  /** The books already open above this panel, root first, as resolved paths.
   *  Nesting has no depth limit; the one thing refused is a book that is
   *  already on the chain, because expanding it again would never end. */
  lineage?: string[];
  /** Take the whole height and scroll inside, rather than capping at a
   *  document-sized box. What a lone topic wants; what a list of them cannot. */
  fill?: boolean;
  /** No card, no header, no border — just the content. */
  bare?: boolean;
  /** Folded into the header row. */
  prefix?: React.ReactNode;
  /** Forwarded to the file's renderer — the PaneTrail drill contract. */
  onDrill?: (pane: { key: string; title: string; render: () => React.ReactNode }) => void;
  /** Forwarded to a nested playbook: contribute panes to the enclosing trail. */
  onSubPanes?: (panes: TrailPane[]) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // Collapsed panels are not fetched.
    if (!open) return;
    // Written in the book: nothing to read, and nothing a directory is needed for.
    if (inline !== undefined) { setText(inline); setErr(null); return; }
    if (!agentId) { setErr("not saved into a directory yet"); return; }
    setText(null); setErr(null);
    readVirtualDirectoryFile(agentId, file)
      .then((r) => { if (live) setText(r.content); })
      .catch((e) => { if (live) setErr(String(e?.message ?? e)); });
    return () => { live = false; };
  }, [agentId, file, inline, open]);

  const preview = useMemo(() => previewForPath(file), [file]);
  const self = inline !== undefined ? `${agentId ?? ""}#${id ?? file}` : agentId ? resolveRef(agentId, file) : file;
  const isBook = file.endsWith(".playbook");

  const body = (
    <Box sx={{ display: open ? (fill ? "flex" : "block") : "none",
               ...(fill
                 // A nested playbook scrolls its own panes, so this must NOT
                 // scroll as well.
                 ? { flex: 1, minHeight: 0, minWidth: 0, flexDirection: "column", overflow: isBook ? "hidden" : "auto" }
                 : { maxHeight: 380, minWidth: 0, overflow: "auto" }) }}>
      {err ? <Typography sx={{ fontSize: 13, color: UNSEEN, p: 1 }}>{file} — {err}</Typography>
        : text == null ? <Box sx={{ p: 2, textAlign: "center" }}><CircularProgress size={16} /></Box>
          : isBook
            ? (lineage.includes(self)
                ? <Typography sx={{ fontSize: 13, color: UNSEEN, p: 1 }}>
                    {file} is already open above — a book cannot contain itself.
                  </Typography>
                : <NestedPlaybook content={text} agentId={agentId} depth={depth + 1}
                                  lineage={[...lineage, self]}
                                  onSubPanes={onSubPanes} />)
            : preview ? <preview.Renderer content={text} height={fill ? "100%" : "auto"}
                                          agentId={agentId} path={file} onDrill={onDrill} />
            : <Box component="pre" sx={{ fontSize: 13, p: 1, m: 0, whiteSpace: "pre-wrap" }}>{text}</Box>}
    </Box>
  );

  if (bare) return <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{body}</Box>;

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 0.75, overflow: "hidden",
               ...(fill && open ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : {}) }}>
      <Stack direction="row" spacing={0.6} onClick={onToggle}
             sx={{ alignItems: "center", px: 0.9, py: 0.45, bgcolor: "#f1f3f7", cursor: "pointer",
                   borderBottom: open ? "1px solid" : "none", borderColor: "divider",
                   "&:hover": { bgcolor: "#e8ebf1" } }}>
        {open ? <KeyboardArrowDownIcon sx={{ fontSize: 15, color: "text.disabled" }} />
              : <KeyboardArrowRightIcon sx={{ fontSize: 15, color: "text.disabled" }} />}
        {prefix}
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{label ?? file}</Typography>
        <Box sx={{ flex: 1 }} />
        {inline === undefined && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>{file}</Typography>}
      </Stack>
      {body}
    </Box>
  );
}

/**
 * A playbook shown inside a playbook.
 *
 * Its assignment is LOCAL and not persisted — the outer file owns the outer
 * answers, and writing the inner ones back would mean two files disagreeing
 * about who holds what. It is handed nothing from outside: the answers chose
 * this file, and that is the whole relationship.
 */
function NestedPlaybook({ content, agentId, depth, lineage, onSubPanes }: {
  content: string; agentId?: string; depth: number; lineage: string[];
  onSubPanes?: (panes: TrailPane[]) => void;
}) {
  const doc = useMemo(() => parsePlaybook(content), [content]);
  const [locks, setLocks] = useState<string[]>(() => pruneLocks(doc, doc.view.locks ?? []));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <Box sx={{ flex: 1, minHeight: 0, height: "100%" }}>
      <PlaybookWalk doc={doc} agentId={agentId} locks={locks}
                    onLocks={(n) => setLocks(pruneLocks(doc, n))}
                    collapsed={collapsed}
                    onCollapse={(f) => setCollapsed((c) => {
                      const n = new Set(c);
                      if (n.has(f)) n.delete(f); else n.add(f);
                      return n;
                    })}
                    depth={depth} lineage={lineage}
                    onSubPanes={onSubPanes} />
    </Box>
  );
}

export default function PlaybookWalk({
  doc, agentId, locks, onLocks, collapsed, onCollapse, depth = 0, lineage, history = [],
  onTook, onJump, onSubPanes, hideDecisions, onElementJump,
}: {
  doc: PlaybookDoc;
  agentId?: string;
  locks: string[];
  onLocks: (next: string[]) => void;
  collapsed: Set<string>;
  onCollapse: (file: string) => void;
  onElementJump?: (el: { kind: "decision" | "event"; key: string; label: string }) => void;
  /** Set when this walk sits inside an enclosing PaneTrail: render only the
   *  rail and PUSH detail/drill panes up — one flat trail, one seek. */
  onSubPanes?: (panes: TrailPane[]) => void;
  hideDecisions?: boolean;
  depth?: number;
  /** Books open above this one (see ContentPanel). The root supplies itself. */
  lineage?: string[];
  /** The trail, owned by the root. */
  history?: { event: string; from?: string[]; locks: string[] }[];
  onTook?: (eventKey: string, locks: string[], from: string[]) => void;
  onJump?: (index: number) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // Ticks on every event click, so a re-click brings the content pane back on
  // a phone where the rail had replaced it.
  const [reveal, setReveal] = useState(0);
  // The root puts its own path on the chain; nested walks are handed theirs.
  const chain = useMemo(() => lineage ?? (agentId ? [agentId] : []), [lineage, agentId]);
  // A viewer inside the detail pane can drill one level deeper (a guide step's
  // content). Owned here so closing or switching the event drops it.
  const [drill, setDrill] = useState<{ key: string; title: string; render: () => React.ReactNode } | null>(null);
  // Panes a NESTED book (rendered inside our right pane) contributes to OUR trail.
  const [subPanes, setSubPanes] = useState<TrailPane[]>([]);
  const [everOpened, setEverOpened] = useState(false);
  useEffect(() => { if (open) setEverOpened(true); }, [open]);
  useEffect(() => { setDrill(null); }, [open]);

  // Decisions with a single available answer are taken automatically and never
  // shown — see `impliedLocks`. Kept separate from `locks` so what gets WRITTEN
  // stays the set of answers somebody actually chose.
  const eff = useMemo(() => impliedLocks(doc, locks), [doc, locks]);
  const rows = useMemo(() => decisionRows(doc, eff), [doc, eff]);

  const events = eventsAt(doc, eff);
  const topics = topicsAt(doc, eff);

  // The content for whichever event is open renders on the RIGHT, with the
  // topics, because it is content — the rail is for choosing.
  const openEvent = open ? doc.events.find((e) => e.key === open) : undefined;
  const openRule = open ? ruleFor(doc, open, eff) : undefined;
  const openContent = openEvent?.content ?? [];
  // Markdown, through the same registry that renders any other `.md`.
  const md = useMemo(() => previewForPath("process.md"), []);

  const nested = depth > 0;
  // Once a detail pane has existed, closing the event EMPTIES it rather than
  // removing it — a stable chain, no layout jump.
  const showRight = topics.length > 0 || !!openEvent || everOpened;
  // One topic needs no heading — the pane IS the topic.
  const lone = topics.length === 1 && !openEvent;

  /** One content entry under the current answers: its panel, or why there is none yet. */
  const panelFor = (entry: PlaybookContent, extra: {
    key?: string; label?: string; bare?: boolean; fill?: boolean; prefix?: React.ReactNode; alwaysOpen?: boolean;
    /** Where the entry sits (`event fund/2`) — what names a written entry with no key or label. */
    at?: string;
    /** What the rule says to do while the entry's answers are not all taken. */
    process?: string;
  } = {}) => {
    const c = variationOf(entry, eff);
    const id = contentKey(entry, extra.at ?? "inline");
    if (c.missing.length) return <Unanswered key={extra.key ?? id} doc={doc} decisions={c.missing} process={extra.process} />;
    const inline = isInline(entry);
    // A keyed entry collapses by its key. A keyless file entry collapses by the file shown (a `by`
    // variation is its own panel); a keyless written one by its label or position.
    const shown = entry.key ?? (c.file || id);
    // The panel's identity: the file shown, or — in the book — the entry plus the segments its
    // document answers to, so a written set remounts when the answers pick another member.
    const self = inline ? (c.segs.length ? `${id}/${variantKey(c.segs)}` : id) : c.file;
    return (
      <ContentPanel key={extra.key ?? self} agentId={agentId}
                    file={inline ? contentPath(entry) : c.file} inline={inline ? contentText(entry, c.segs) : undefined} id={self}
                    label={extra.label ?? entry.label}
                    depth={depth} lineage={chain}
                    fill={extra.fill} bare={extra.bare} prefix={extra.prefix}
                    open={extra.alwaysOpen || !collapsed.has(shown)}
                    onToggle={() => { if (!extra.alwaysOpen) onCollapse(shown); }}
                    onDrill={setDrill} onSubPanes={setSubPanes} />
    );
  };

  // In trail mode nothing renders beside the rail here — the right side goes
  // up to the enclosing trail as panes of its own.
  const railBeside = showRight && !onSubPanes;
  const railPane = (
    <Stack direction={railBeside ? "row" : "column"} sx={{ height: "100%", minHeight: 0 }}>
      <SidePanel disabled={!railBeside} defaultWidth={nested ? 320 : 350}
                 minWidth={230} maxWidth={640} title="Where we are">
      <Box sx={{ overflow: "auto", p: 1,
                 ...(railBeside ? { height: "100%" } : { width: "100%", flex: 1, minHeight: 0 }) }}>
        {!!onJump && !!history.length && (
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                              letterSpacing: 0.6, color: "text.disabled", mb: 0.3 }}>
              How we got here
            </Typography>
            <Stack direction="row" sx={{ flexWrap: "wrap", alignItems: "center", gap: 0.2 }}>
              {/* Only offered when the first event recorded where it came from. */}
              {!!history[0]?.from && (
                <Tooltip title="Back to before the first event">
                  <Box onClick={() => onJump(-1)}
                       sx={{ px: 0.5, py: 0.1, borderRadius: 3, fontSize: 12, cursor: "pointer",
                             color: "text.disabled", border: "1px solid", borderColor: "#c3c9d2" }}>
                    start
                  </Box>
                </Tooltip>
              )}
              {history.map((h, i) => {
                const last = i === history.length - 1;
                return (
                  <Box key={`${h.event}-${i}`} sx={{ display: "flex", alignItems: "center" }}>
                    <Typography sx={{ fontSize: 12, color: "text.disabled", mx: 0.2 }}>›</Typography>
                    <Tooltip title={last ? "Where we are" : "Go back to just after this"}>
                      <Box onClick={() => onJump(i)}
                           sx={{ px: 0.6, py: 0.1, borderRadius: 3, fontSize: 12, cursor: "pointer",
                                 fontWeight: last ? 700 : 400,
                                 bgcolor: last ? "#334155" : "transparent",
                                 color: last ? "#ffffff" : "text.secondary",
                                 border: "1px solid", borderColor: last ? "#334155" : "#c3c9d2" }}>
                        {doc.events.find((e) => e.key === h.event)?.label ?? h.event}
                      </Box>
                    </Tooltip>
                  </Box>
                );
              })}
            </Stack>
            {/* The trail records events; editing an answer by hand is not one. */}
            {(() => {
              const at = history[history.length - 1]?.locks ?? [];
              const same = at.length === locks.length && at.every((l) => locks.includes(l));
              return same ? null : (
                <Typography sx={{ fontSize: 12, color: UNSEEN, mt: 0.3 }}>
                  answers changed by hand since the last event
                </Typography>
              );
            })()}
          </Box>
        )}

        {/* Nothing to answer = no header counting to zero. */}
        {!hideDecisions && (rows.length > 0 || locks.length > 0) && (<>
        <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                          letterSpacing: 0.6, color: "text.secondary", mb: 0.6 }}>
          Where we are · {locks.length} of {rows.length} answered
        </Typography>
        <Box sx={{ mb: 1.25 }}>
          <DecisionPills decisions={doc.decisions} value={locks} onChange={onLocks}
                         action={onElementJump ? (dk) => {
                           const d = doc.decisions.find((x) => x.key === dk);
                           return (
                             <button type="button" title={`Open the “${d?.label ?? dk}” node`}
                               style={{ display: "inline-flex", padding: 1, marginLeft: 3, borderRadius: 4,
                                        cursor: "pointer", background: "transparent", border: "none",
                                        color: "#4f46e5", verticalAlign: "middle" }}
                               onClick={(ev) => { ev.stopPropagation(); onElementJump({ kind: "decision", key: dk, label: d?.label ?? dk }); }}>
                               <CrosshairIcon sx={{ fontSize: 12 }} />
                             </button>
                           );
                         } : undefined} />
        </Box>
        </>)}

        {/* No live events = no list and no search box counting to zero. */}
        {events.length > 0 && (
        <OneDList items={events} keyOf={(e) => e.key}
          // A book with no domains reads as a flat list.
          dimension={events.some((e) => e.domain) ? { of: (e) => e.domain ?? "" } : undefined}
          mode="headings"
          search={(e) => `${e.label} ${e.domain ?? ""}`}
          searchPlaceholder="Search events"
          renderItem={(e) => {
            const r = ruleFor(doc, e.key, eff);
            const door = !!r?.sets?.length;
            const expanded = open === e.key;
            // Version 1 triages each event (ready, gap, n/a, or nobody has looked) and the
            // dot says which. At version 2 the document shows once the answers it follows
            // are taken, and until then the hint does.
            const triaged = doc.version < 2;
            const fg = r?.status ? (STATUS_FG[r.status] ?? UNSEEN) : UNSEEN;
            return (
              <EventRow
                label={e.label}
                annotateTarget={`event:${e.key}`}
                badge={onElementJump ? (
                  <button type="button" title={`Open the “${e.label}” node`}
                    style={{ display: "inline-flex", padding: 2, borderRadius: 4, cursor: "pointer",
                             background: "transparent", border: "none", color: "#4f46e5" }}
                    onClick={(ev) => { ev.stopPropagation(); onElementJump({ kind: "event", key: e.key, label: e.label }); }}>
                    <CrosshairIcon sx={{ fontSize: 13 }} />
                  </button>
                ) : undefined}
                trigger={e.trigger}
                repeats={e.arity === "many"}
                rate={e.rate}
                detail={e.detail}
                status={triaged ? { color: fg, title:
                  r?.status === "ready" ? "we know what to do"
                  : r?.status === "gap" ? "no answer yet"
                  : r?.status === "n/a" ? "cannot arise here"
                  : "nobody has looked" } : undefined}
                subtitle={triaged && !r?.status ? (
                  <Typography component="span" sx={{ fontSize: 12, color: UNSEEN, fontStyle: "italic" }}>
                    nobody has looked at this here
                  </Typography>
                ) : undefined}
                open={expanded}
                expands={false}
                // A click SELECTS the event; its content shows in the pane, never
                // inline, so there is nothing to collapse. A second click only
                // brings that pane back into view.
                onToggle={() => { setOpen(e.key); setReveal((r) => r + 1); }}
              >
                {expanded && door && (
                  <Box sx={{ px: 0.95, pb: 0.8, pt: 0.2 }}>
                    <Chip size="small" icon={<ArrowForwardIcon sx={{ fontSize: 13 }} />}
                          label={`Take it — ${r!.sets!.join(", ")}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            // ONE write per click: the root records the step and
                            // sets the answers together; a nested book just moves.
                            const next = applyRefs(locks, r!.sets!);
                            if (onTook) onTook(e.key, next, locks); else onLocks(next);
                          }}
                          sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                                bgcolor: "transparent", color: "text.secondary",
                                border: "1px solid", borderColor: "#9ca3af" }} />
                  </Box>
                )}
              </EventRow>
            );
          }} />
        )}
      </Box>
      </SidePanel>
    </Stack>
  );

  const rightPane = !showRight ? null : (
      <Stack sx={{ flex: 1, minWidth: 0, minHeight: 0, p: 1.25 }}>

        {!!openEvent && (() => {
          // ONE thing per event — which thing comes from the `event-detail`
          // golden table (eventDetailRules.ts).
          const detail = decide(eventDetailRules, {
            sources: openContent.length,
            hasProcess: !!openRule?.process,
          }).outcome;
          const prefix = (
            <>
              {openEvent.trigger === "chosen"
                ? <PanToolIcon sx={{ fontSize: 12, color: NEUTRAL }} />
                : <BoltIcon sx={{ fontSize: 13, color: NEUTRAL }} />}
              <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                                letterSpacing: 0.5, color: "text.disabled" }}>
                {openEvent.label} ·
              </Typography>
            </>
          );
          // Several files are a LIST of panels at their natural height that scrolls;
          // only a lone file takes the whole pane (a nested book scrolls itself).
          const list = detail.show === "panels";
          return (
          <Box sx={{ mb: topics.length ? 1.75 : 0, pb: topics.length ? 1.25 : 0,
                     ...(topics.length
                       ? { borderBottom: "1px solid", borderColor: "divider", flexShrink: 0,
                           maxHeight: "50%", minWidth: 0, overflow: "auto" }
                       : list
                         // A block that scrolls: as a flex column the cards, being overflow:hidden,
                         // could shrink to nothing to fit the pane.
                         ? { flex: 1, minHeight: 0, minWidth: 0, overflow: "auto" }
                         // Anything wider than the pane scrolls HERE, never the walk or the trail.
                         : { flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", overflowX: "auto" }) }}>
            {/* What the event means, then what happens. */}
            {openEvent.detail && (
              <Typography sx={{ fontSize: 13, color: "text.secondary", fontStyle: "italic", mb: 0.75, flexShrink: 0 }}>
                {openEvent.detail}
              </Typography>
            )}
            {(detail.show === "process" || detail.show === "empty") && (
              openRule?.process ? (
                md ? <md.Renderer content={openRule.process} height="auto" />
                   : <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap", color: "text.secondary" }}>
                       {openRule.process}
                     </Typography>
              ) : (
                <Typography sx={{ fontSize: 13, color: UNSEEN, fontStyle: "italic" }}>
                  {openRule?.sets?.length
                    ? "No prerequisite recorded for this door."
                    : "No response recorded — this is a hole, not a nothing."}
                </Typography>
              )
            )}
            {detail.show === "file-bare" && panelFor(openContent[0], { bare: true, fill: !topics.length, alwaysOpen: true, at: `event ${openEvent.key}/0`, process: openRule?.process })}
            {detail.show === "panels" && openContent.map((c, i) =>
              panelFor(c, { label: c.label ?? "The sequence", prefix, at: `event ${openEvent.key}/${i}`, process: openRule?.process }))}
          </Box>
          );
        })()}

        {/* The pane outlives the event that opened it (no layout jump), so say
            what fills it rather than leave a blank page after a collapse. */}
        {!openEvent && !topics.length && (
          <Typography sx={{ fontSize: 13, color: UNSEEN, fontStyle: "italic", p: 1 }}>
            Take an event to see what it shows.
          </Typography>
        )}

        {topics.length > 1 && (
          <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: 0.6, color: "text.secondary", mb: 0.75, flexShrink: 0 }}>
            What is true here · {topics.length} topics
          </Typography>
        )}

        {/* Not rendered at all when empty: a flex:1 box with nothing in it still claims half the pane. */}
        {!!topics.length && (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: lone ? "hidden" : "auto" }}>
        {topics.map((topic) => (
          <Box key={topic.key}
               sx={lone ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : { mb: 1.5 }}>
            {!lone && (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline", mb: 0.4 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{topic.label}</Typography>
              {!topic.when?.length && (
                <Tooltip title="Always live — what it shows changes with the answers, but it never goes away">
                  <Typography sx={{ fontSize: 12, color: "text.disabled" }}>always</Typography>
                </Tooltip>
              )}
            </Stack>
            )}
            {topic.content.length
              ? topic.content.map((c, i) => panelFor(c, { fill: lone, bare: lone, at: `topic ${topic.key}/${i}` }))
              : (
                <Typography sx={{ fontSize: 13, color: UNSEEN, fontStyle: "italic" }}>
                  Nothing attached to this topic yet.
                </Typography>
              )}
          </Box>
        ))}
        </Box>
        )}
      </Stack>
  );

  // Pane keys carry the book they belong to: the trail is ONE flat chain, and a
  // nested book with the same event key would otherwise collide with ours.
  const me = chain[chain.length - 1] ?? "";
  const detailTitle = open
    ? (events.find((e) => e.key === open)?.label ?? open)
    : (topics.length === 1 ? topics[0].label : topics.length ? "Topics" : (doc.title || "Content"));
  const detailPane: TrailPane | null = rightPane
    ? { key: `${me}|detail:${open ?? "topics"}`, title: detailTitle, render: rightPane, revealed: reveal }
    : null;
  const drillPane: TrailPane | null = drill && showRight
    ? {
        key: `${me}|${drill.key}`,
        title: drill.title,
        render: (
          <Box sx={{ minHeight: 0, flex: 1, overflow: "auto" }}>
            <Typography sx={{ px: 1.5, pt: 1.25, fontSize: 13, fontWeight: 650 }}>{drill.title}</Typography>
            {drill.render()}
          </Box>
        ),
      }
    : null;

  // Trail mode: hand the detail + drill up. Deps are the inputs the pushed
  // elements were built from, so the enclosing trail re-renders in step.
  const pushKey = [open ?? "", String(reveal), eff.join("|"), [...collapsed].join("|")].join("~");
  useEffect(() => {
    if (!onSubPanes) return;
    onSubPanes([
      ...(detailPane ? [detailPane] : []),
      ...subPanes,
      ...(drillPane ? [drillPane] : []),
    ]);
    return () => onSubPanes([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSubPanes, pushKey, drill, showRight, doc, subPanes]);

  if (onSubPanes) return railPane;

  return (
    <PaneTrail
      className="h-full"
      panes={[
        { key: "walk", title: doc.title || "Where we are", width: showRight ? "auto" : undefined, render: railPane },
        ...(detailPane ? [detailPane] : []),
        ...subPanes,
        ...(drillPane ? [drillPane] : []),
      ]}
    />
  );
}
