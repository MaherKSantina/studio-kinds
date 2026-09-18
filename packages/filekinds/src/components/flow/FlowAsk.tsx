/**
 * The flow's Ask — the shared panel (crosscut) aimed by the preview: the
 * screen the reader stands on and the state on screen are the target; the
 * reply is applied through the flow vocabulary (lib/flowAsk), which runs the
 * same mutators the dialogs use and never touches the views half. The frames
 * beside the flow, with their views, go to the model each turn so "show the
 * Loading view of login.frame" resolves to real names. Transport and file
 * access are the host's configured adapters.
 */
import * as React from "react";
import { type AskApi, AskPanel, type AskTargetChip, parentOf } from "crosscut";
import { configuredAsk, configuredLister, configuredReader } from "../../api";
import { FLOW_ASK_SCHEMA, type FlowAskFrame, applyFlowOps, flowAskSystem, flowAskUser, parseFlowAskReply } from "../../lib/flowAsk";
import { parseFlowFile } from "../../lib/flowEngine";
import { parseFrame } from "../../lib/frameDoc";
import type { FlowFocus } from "./FlowPreview";

const EXAMPLES = [
  "add a Payment failed screen after Checkout", "make this state show the Loading view of login.frame",
  "add a Retry control here that comes back to this screen", "add a state for featureFlag false without the banner",
];

/** The `.frame` files beside a flow — its folder and two levels below — with their views. */
async function framesNear(folder: string): Promise<FlowAskFrame[]> {
  const list = configuredLister();
  const read = configuredReader();
  if (!list || !read) return [];
  const root = folder.replace(/\/+$/, "") || "/";
  const found: string[] = [];
  const walk = async (dir: string, depth: number) => {
    let entries: { path: string; name: string; kind: "folder" | "file" }[] = [];
    try { entries = await list(dir); } catch { return; }
    for (const e of entries) {
      if (e.kind === "file" && e.name.toLowerCase().endsWith(".frame")) found.push(e.path);
      else if (e.kind === "folder" && depth < 2 && !e.name.includes(".")) await walk(e.path, depth + 1);
    }
  };
  await walk(root, 0);
  const out: FlowAskFrame[] = [];
  for (const abs of found.sort()) {
    try {
      const doc = parseFrame(await read(abs));
      out.push({ path: abs.slice(root === "/" ? 1 : root.length + 1), views: doc.views.map((v) => ({ id: v.id, name: v.name })) });
    } catch { /* unreadable: leave it out */ }
  }
  return out;
}

export interface FlowAskProps {
  content: string;
  docPath: string;
  focus: FlowFocus;
  focusKey?: number;
  onChange: (next: string) => void;
  onClose?: () => void;
}

function FlowAskPanel({ ask, content, docPath, focus, focusKey, onChange, onClose }: FlowAskProps & { ask: AskApi }) {
  const latest = React.useRef(content);
  latest.current = content;
  const { body } = React.useMemo(() => parseFlowFile(content), [content]);
  const screen = focus.screenId ? body.screens.find((s) => s.id === focus.screenId) : undefined;
  const state = screen && focus.stateIndex !== null ? screen.variants[focus.stateIndex] : undefined;
  const target: AskTargetChip[] = screen
    ? [{ label: screen.title, detail: screen.id }, state ? { label: state.label, detail: `state ${(focus.stateIndex ?? 0) + 1}` } : { label: "the screen itself" }]
    : [];

  return (
    <AskPanel
      api={ask}
      target={target}
      targetHint="the whole flow — stand on a screen in Preview to aim"
      placeholder={screen ? `What should change on ${screen.title}?` : "What should change?"}
      examples={EXAMPLES}
      compose={async (instruction, history) => ({
        system: flowAskSystem(),
        user: flowAskUser(latest.current, focus, instruction, history, await framesNear(parentOf(docPath))),
        schema: FLOW_ASK_SCHEMA,
      })}
      snapshot={() => latest.current}
      onRestore={onChange}
      apply={(output) => {
        const reply = parseFlowAskReply(output);
        const r = applyFlowOps(latest.current, reply.ops, focus);
        if (r.applied.length) onChange(r.content);
        return { say: reply.say, applied: r.applied, skipped: r.skipped };
      }}
      resetKey={docPath}
      focusKey={focusKey}
      onClose={onClose}
    />
  );
}

export default function FlowAsk(props: FlowAskProps) {
  const ask = configuredAsk();
  if (!ask) {
    return <div className="p-3 text-[13px] text-muted-foreground">Ask is not available here — this host has no model bridge configured.</div>;
  }
  return <FlowAskPanel ask={ask} {...props} />;
}
