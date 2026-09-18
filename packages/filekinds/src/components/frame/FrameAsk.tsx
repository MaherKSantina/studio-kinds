/**
 * The frame editor's Ask — the shared panel (crosscut) aimed by the canvas:
 * the current view and the selected node are the target, the reply is
 * applied through the frame vocabulary (lib/frameAsk), and a node or view
 * the reply created becomes the next target so "now make it blue" follows.
 * The transport is the host's configured ask API (the suite's ask worker).
 */
import * as React from "react";
import { type AskApi, AskPanel, type AskTargetChip } from "crosscut";
import { configuredAsk } from "../../api";
import { FRAME_ASK_SCHEMA, applyFrameOps, frameAskSystem, frameAskUser, parseFrameAskReply } from "../../lib/frameAsk";
import { type FrameDoc, nodeById, viewById } from "../../lib/frameDoc";

export interface FrameAskProps {
  doc: FrameDoc;
  content: string;
  docPath: string;
  viewId: string | null;
  selectedId: string | null;
  focusKey?: number;
  onDoc: (next: FrameDoc) => void;
  onRestore: (yaml: string) => void;
  onSelect: (id: string | null) => void;
  onView: (id: string | null) => void;
}

const EXAMPLES = [
  "add a Continue button under the email field", "make it bigger and blue", "hide the footer in Loading",
  "add an Error view without the form", "note: Sam wants this above the fold",
];

function FrameAskPanel({ ask, doc, content, docPath, viewId, selectedId, focusKey, onDoc, onRestore, onSelect, onView }: FrameAskProps & { ask: AskApi }) {
  // The latest document and text, for a reply that arrives after the user
  // kept editing: ops address ids, so they land on what is there now.
  const latest = React.useRef({ doc, content });
  latest.current = { doc, content };

  const view = viewById(doc, viewId);
  const node = selectedId ? nodeById(doc, selectedId) : undefined;
  const target: AskTargetChip[] = [
    { label: view ? view.name : "Base" },
    ...(node ? [{ label: node.name, detail: node.kind, onClear: () => onSelect(null) }] : []),
  ];

  return (
    <AskPanel
      api={ask}
      target={target}
      placeholder={node ? `What should change about ${node.name}?` : "What should change?"}
      examples={EXAMPLES}
      compose={(instruction, history) => ({
        system: frameAskSystem(),
        user: frameAskUser(latest.current.doc, { viewId, nodeId: selectedId }, instruction, history),
        schema: FRAME_ASK_SCHEMA,
      })}
      snapshot={() => latest.current.content}
      onRestore={onRestore}
      apply={(output) => {
        const reply = parseFrameAskReply(output);
        const r = applyFrameOps(latest.current.doc, reply.ops, { viewId, nodeId: selectedId });
        if (r.applied.length) onDoc(r.doc);
        if (r.focusViewId) onView(r.focusViewId);
        if (r.focusId) onSelect(r.focusId);
        return { say: reply.say, applied: r.applied, skipped: r.skipped };
      }}
      resetKey={docPath}
      focusKey={focusKey}
    />
  );
}

export default function FrameAsk(props: FrameAskProps) {
  const ask = configuredAsk();
  if (!ask) {
    return <div className="p-3 text-[13px] text-muted-foreground">Ask is not available here — this host has no model bridge configured.</div>;
  }
  return <FrameAskPanel ask={ask} {...props} />;
}
