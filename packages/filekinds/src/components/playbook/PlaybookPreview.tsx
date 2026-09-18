/**
 * One view over one file: the WALK — where you stand, the answers taken, what
 * can happen here, and what is true while it does.
 *
 * Version 1 persists its view (answers, trail, what is collapsed) through the
 * host's `onChange`; a host without one keeps it for the session. So does a
 * host WITH one when the file is something this engine cannot carry (a newer
 * version, or version 1 holding version-2 content): a save re-emits what was
 * read and would lose the rest, so the file is held, and a line at the top
 * says so.
 *
 * Version 2 is SESSION-ONLY by design: the file has no `view`, every decision
 * opens unanswered, and answering, walking through a door or folding a panel
 * changes the screen and nothing else. `onChange` is never called for a
 * version-2 book.
 */
import { useCallback, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { dumpPlaybook, parsePlaybook, pruneLocks, versionProblems, type PlaybookView } from "../../lib/playbookDoc";
import PlaybookWalk from "./PlaybookWalk";

const UNSEEN = "#a16207";

export default function PlaybookPreview({ content, height = "100%", onChange, agentId, onElementJump }: {
  content: string;
  height?: number | string;
  /** Accepted for the registry's sake; the playbook has no authoring surface. */
  editable?: boolean;
  onChange?: (next: string) => void;
  agentId?: string;
  path?: string;
  /** Accepted for the registry's sake; the walk has no chrome to hide. */
  chromeless?: boolean;
  onElementJump?: (el: { kind: "decision" | "event"; key: string; label: string }) => void;
}) {
  const [seen, setSeen] = useState(content);
  // Read-only hosts pass no onChange. The walk is still fully interactive —
  // edits land HERE and are dropped when the host's content moves on.
  const [localNext, setLocalNext] = useState<string | null>(null);
  // A version-2 walk: the view lives here and nowhere else.
  const [session, setSession] = useState<PlaybookView>({});

  // The host got there first — its content wins and our copy is dropped.
  const stale = content !== seen;
  const text = stale ? content : (localNext ?? content);
  if (stale) { setSeen(content); setLocalNext(null); setSession({}); }

  const doc = useMemo(() => parsePlaybook(text), [text]);
  const sessionOnly = doc.version >= 2;

  // Judged on the HOST's text, never on our own dump: a dump reads as carried,
  // and the second click would write what the first one held.
  const held = useMemo(() => versionProblems(content), [content]);
  const commitText = useCallback((next: string) => {
    if (onChange && !held.length) onChange(next);
    else setLocalNext(next);
  }, [onChange, held]);

  const view = sessionOnly ? session : doc.view;
  const setView = useCallback((patch: Partial<PlaybookView>) => {
    if (sessionOnly) setSession((v) => ({ ...v, ...patch }));
    else commitText(dumpPlaybook({ ...doc, view: { ...doc.view, ...patch } }));
  }, [sessionOnly, doc, commitText]);

  // Pruned on the way in as well as on the way out: a file hand-edited to hold
  // an answer to a question nothing is asking should open sane, not broken.
  const locks = useMemo(() => pruneLocks(doc, view.locks ?? []), [doc, view.locks]);
  const collapsed = useMemo(() => new Set(view.collapsed ?? []), [view.collapsed]);

  const toggleCollapse = useCallback((file: string) => {
    const next = new Set(collapsed);
    if (next.has(file)) next.delete(file); else next.add(file);
    setView({ collapsed: [...next] });
  }, [collapsed, setView]);

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* A version-1 file the engine cannot carry is held; a version-2 book is session-only by design and says nothing. */}
      {!sessionOnly && !!held.length && !!onChange && (
        <Typography sx={{ fontSize: 12, color: UNSEEN, px: 1, py: 0.4, flexShrink: 0,
                          borderBottom: "1px solid", borderColor: "divider" }}>
          Not saved — {held[0]}{held.length > 1 ? ` (+${held.length - 1} more)` : ""}. The walk is kept for this session only.
        </Typography>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* A fresh file says so: an empty walk is a blank page, and a blank page reads as broken. */}
      {!doc.decisions.length && !doc.events.length && !doc.topics.length && (
        <Typography variant="body2" sx={{ m: 3, color: "text.secondary" }}>
          An empty playbook — no decisions, events or topics yet.
        </Typography>
      )}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <PlaybookWalk onElementJump={onElementJump} doc={doc} agentId={agentId} locks={locks}
                      onLocks={(next) => setView({ locks: pruneLocks(doc, next) })}
                      collapsed={collapsed} onCollapse={toggleCollapse}
                      // A version-2 book is stateless: only the rail moves the answers, so there is no trail.
                      history={sessionOnly ? [] : (view.history ?? [])}
                      onTook={sessionOnly ? undefined : (event, next, from) => setView({
                        locks: pruneLocks(doc, next),
                        history: [...(view.history ?? []), { event, from, locks: pruneLocks(doc, next) }],
                      })}
                      onJump={sessionOnly ? undefined : (i) => {
                        // Going back TRUNCATES. "start" is where the first event
                        // began, not an empty board.
                        const h = view.history ?? [];
                        const back = i < 0 ? (h[0]?.from ?? locks) : h[i].locks;
                        setView({ locks: pruneLocks(doc, back), history: i < 0 ? [] : h.slice(0, i + 1) });
                      }} />
      </Box>
      </Box>
    </Box>
  );
}
