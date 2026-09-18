/**
 * THE FLOW AUTHORING SURFACE — the `.flow` kind's registry `Editor`. The
 * surface IS the legacy flow surface: `FlowKindView` (the ported
 * `FlowFileView` — the parameter explorer, the screen page with its state
 * and control dialogs, the map, the missing-captures list) with authoring
 * enabled and the preview alone: the source lives in the host (the Studio's
 * file, VS Code's text editor), so there is no Raw pane and no Schema button.
 * The Ask panel rides a collapsed rail on the right — never over the flow's
 * own tabs — and opens from the rail or Ctrl+K, aimed at the screen and
 * state the preview stands on.
 */
import * as React from "react";
import { SidePanel } from "crosscut";
import type { KindEditorProps } from "../../lib/filePreviews";
import FlowAsk from "./FlowAsk";
import FlowKindView, { type FlowFocus } from "./FlowKindView";

export default function FlowAuthoring({ content, onChange, docPath }: KindEditorProps) {
  // Closed until asked for — the document is the point; the chat is a tool.
  const [askOpen, setAskOpen] = React.useState(false);
  const [askFocus, setAskFocus] = React.useState(0);
  const [focus, setFocus] = React.useState<FlowFocus>({ screenId: null, stateIndex: null });
  const onFocus = React.useCallback((f: FlowFocus) => {
    setFocus((cur) => (cur.screenId === f.screenId && cur.stateIndex === f.stateIndex ? cur : f));
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAskOpen(true); setAskFocus((k) => k + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <FlowKindView content={content} height="100%" agentId={docPath} path={docPath} onChange={onChange} editable onFocus={onFocus} previewOnly />
      </div>
      <SidePanel side="right" title="Ask" collapsed={!askOpen} defaultWidth={340} minWidth={280}
        onCollapsedChange={(c) => { setAskOpen(!c); if (!c) setAskFocus((k) => k + 1); }}>
        <div className="flex h-full min-h-0 flex-col bg-card">
          <FlowAsk content={content} docPath={docPath} focus={focus} focusKey={askFocus} onChange={onChange} onClose={() => setAskOpen(false)} />
        </div>
      </SidePanel>
    </div>
  );
}
