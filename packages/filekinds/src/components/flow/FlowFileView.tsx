/**
 * Host for a `.flow` file. Owns the Raw/Preview toggle and bridges the one combined blob to its
 * two halves:
 *  - Raw     → `FlowEditor`: two stacked Monaco panes (model + views), with validation problems
 *              surfaced under the model pane.
 *  - Preview → `FlowPreview`: the parameter explorer. Its `onViewsChange` re-serializes only the
 *              views half, so exploring never touches the authored model.
 *
 * Same split-host contract as `.analysis`, registered through `splitFileTypes.ts`.
 */
import { useMemo } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { ACTION_BG, ACTION_BG_HOVER, ACTION_FG, MUTED } from "./flowPalette";
import { useFilePreviewMode } from "./flowHost";
import SchemaHelpButton from "./SchemaHelpButton";
import { ITEM_FILE_TEMPLATES } from "./flowHost";
import FlowEditor from "./FlowEditor";
import FlowPreview, { type FlowFocus } from "./FlowPreview";
import {
  type FlowDoc, type FlowViews, dumpFlow, dumpViews, parseFlowFile, parseViews, splitFlowFile,
  withModel, withViews,
} from "../../lib/flowEngine";
import { addScreen, validateFlowFile } from "../../lib/flowOps";

type Height = number | string;

export default function FlowFileView({
  agentId, path, content, savedContent, onContentChange, onSave, saving, autoSave, editable, height = 480, onFocus, previewOnly,
}: {
  agentId?: string;
  path?: string;
  content: string;
  savedContent: string;
  onContentChange: (next: string) => void;
  onSave: () => void;
  saving: boolean;
  autoSave: boolean;
  editable: boolean;
  height?: Height;
  /** Where the reader stands in the preview — the screen and the state on screen. */
  onFocus?: (focus: FlowFocus) => void;
  /** The preview alone: no Raw/Preview toggle, no Schema button — an authoring host whose source
   *  lives elsewhere (the Studio, VS Code's text editor), or a chromeless embed. */
  previewOnly?: boolean;
}) {
  const [previewFlag, setPreview] = useFilePreviewMode();
  const mode: "raw" | "preview" = previewOnly || previewFlag ? "preview" : "raw";

  const { body, doc, error } = useMemo(() => parseFlowFile(content), [content]);
  const problems = useMemo(() => {
    if (error) return [`model YAML parse error: ${error}`];
    return validateFlowFile(content);
  }, [content, error]);
  const views = useMemo(() => parseViews(content, body), [content, body]);

  const onViewsChange = (next: FlowViews) => onContentChange(withViews(content, next));

  /**
   * Apply a mutation to the MODEL half.
   *
   * The mutators operate in place on a FlowDoc, so this clones first — a rejected edit must not
   * leave a half-applied change behind, and React needs a new object to re-render from anyway.
   * Only a mutation that reports ok is written back.
   */
  const onDocChange = (mutate: (draft: FlowDoc) => { ok: boolean; error?: string }) => {
    const draft: FlowDoc = JSON.parse(JSON.stringify(doc));
    const r = mutate(draft);
    if (!r.ok) return;
    onContentChange(withModel(content, dumpFlow(draft)));
  };

  // A model that will not parse has no graph to draw, so Preview falls back to the problem list.
  // A model that parses but has no screens is not broken — it is EMPTY, and says so.
  const canPreview = !error && body.screens.length > 0;
  const empty = !error && body.screens.length === 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, height, minHeight: 0 }}>
      {!previewOnly && (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        <ToggleButtonGroup
          size="small" exclusive value={mode}
          onChange={(_, v) => v && setPreview(v === "preview")}
          sx={{ "& .MuiToggleButton-root": { py: 0.25, px: 1.25, fontSize: 12, textTransform: "none" } }}
        >
          <ToggleButton value="raw">Raw</ToggleButton>
          <ToggleButton value="preview">Preview</ToggleButton>
        </ToggleButtonGroup>
        {ITEM_FILE_TEMPLATES.flow && <SchemaHelpButton template={ITEM_FILE_TEMPLATES.flow} typeLabel="Flow" />}
        <Box sx={{ flex: 1 }} />
        {problems.length > 0 && (
          <Typography variant="caption" color="error" sx={{ fontSize: 13 }}>
            {problems.length} problem{problems.length === 1 ? "" : "s"}
          </Typography>
        )}
      </Box>
      )}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {mode === "raw" ? (
          <FlowEditor
            content={content}
            savedContent={savedContent}
            onContentChange={onContentChange}
            onSave={onSave}
            saving={saving}
            autoSave={autoSave}
            editable={editable}
            problems={problems}
            height="100%"
          />
        ) : canPreview ? (
          <FlowPreview
            body={body}
            doc={doc}
            views={views}
            onViewsChange={onViewsChange}
            onDocChange={editable ? onDocChange : undefined}
            onWriteModel={editable ? onDocChange : undefined}
            editable={editable}
            height="100%"
            agentId={agentId}
            path={path}
            onFocus={onFocus}
          />
        ) : empty ? (
          <EmptyFlow editable={editable}
            onAddScreen={editable ? () => onDocChange((d) => addScreen(d, { title: "Screen 1", initial: true })) : undefined} />
        ) : (
          <ModelProblems problems={problems} />
        )}
      </Box>
    </Box>
  );
}

/** A flow with no screens yet — the first thing to do, not a fault to report. */
function EmptyFlow({ editable, onAddScreen }: { editable: boolean; onAddScreen?: () => void }) {
  return (
    <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", p: 3 }}>
      <Box sx={{ maxWidth: 460, textAlign: "center" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>No screens yet</Typography>
        <Typography variant="body2" sx={{ mt: 0.75, color: MUTED }}>
          A flow is a walkthrough: screens, each with the states it can be in, and the controls that lead
          between them. Start with the first screen — or ask for it (Ctrl+K): “add a Login screen showing
          login.frame”.
        </Typography>
        {editable && onAddScreen ? (
          <Button size="small" variant="contained" onClick={onAddScreen}
            sx={{ mt: 2, textTransform: "none", bgcolor: ACTION_BG, color: ACTION_FG, "&:hover": { bgcolor: ACTION_BG_HOVER } }}>
            Add the first screen
          </Button>
        ) : (
          <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: MUTED }}>Open it in the Studio to add one.</Typography>
        )}
      </Box>
    </Box>
  );
}

function ModelProblems({ problems }: { problems: string[] }) {
  return (
    <Box sx={{ p: 1.5, height: "100%", overflow: "auto" }}>
      <Typography variant="body2" color="error" sx={{ fontWeight: 600, mb: 1 }}>
        Can’t build the flow from this model:
      </Typography>
      {problems.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No screens yet — add a <code>screens:</code> list with an <code>id</code> and a <code>title</code>.
        </Typography>
      ) : (
        problems.map((p, i) => (
          <Typography key={i} variant="caption" sx={{ display: "block", color: "error.main", fontFamily: "ui-monospace, monospace" }}>
            {p}
          </Typography>
        ))
      )}
    </Box>
  );
}

/** Re-exported so the diff pane can build the same two halves without re-deriving the split. */
export { splitFlowFile, dumpViews };
