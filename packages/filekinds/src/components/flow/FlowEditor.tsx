/**
 * The "Raw" surface of a `.flow` file: two vertically-stacked Monaco editors — a MODEL pane
 * (dimensions, screens with their variants, and edges) and a VIEWS pane (saved parameter sets).
 * Each is edited independently but both persist into the one file blob, joined by `---`.
 *
 * Copied from AnalysisEditor rather than shared. The shapes are close today; `.flow` is still
 * moving, and a shared Pane would make every change here a change to a shipped file kind.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import { RawEditor } from "./RawEditor";
import { splitFlowFile, joinFlowFile } from "../../lib/flowEngine";

type Height = number | string;

export default function FlowEditor({
  content, savedContent, onContentChange, onSave, saving, autoSave, editable, problems, height = 480,
}: {
  content: string;
  savedContent: string;
  onContentChange: (next: string) => void;
  onSave: () => void;
  saving: boolean;
  autoSave: boolean;
  editable: boolean;
  /** Validation problems for the model pane. */
  problems: string[];
  height?: Height;
}) {
  const { modelText, viewsText } = splitFlowFile(content);
  const saved = splitFlowFile(savedContent);

  const setModel = (next: string) => onContentChange(joinFlowFile(next, viewsText));
  const setViews = (next: string) => onContentChange(joinFlowFile(modelText, next));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, height, minHeight: 0 }}>
      <Pane
        label="Model"
        sublabel="dimensions · screens + variants · edges · the preview never edits this"
        value={modelText}
        dirty={editable && modelText !== saved.modelText}
        saving={saving}
        autoSave={autoSave}
        editable={editable}
        onChange={setModel}
        onSave={onSave}
        problems={problems}
      />
      <Pane
        label="Views"
        sublabel="saved parameter sets · the preview writes here"
        value={viewsText}
        dirty={editable && viewsText !== saved.viewsText}
        saving={saving}
        autoSave={autoSave}
        editable={editable}
        onChange={setViews}
        onSave={onSave}
      />
    </Box>
  );
}

function Pane({
  label, sublabel, value, dirty, saving, autoSave, editable, onChange, onSave, problems,
}: {
  label: string;
  sublabel: string;
  value: string;
  dirty: boolean;
  saving: boolean;
  autoSave: boolean;
  editable: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  problems?: string[];
}) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, border: "1px solid", borderColor: "divider", borderRadius: 0.5, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper", flexShrink: 0 }}>
        <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>{sublabel}</Typography>
        {editable && autoSave && (
          <Typography variant="caption" color="text.secondary" noWrap>{saving ? "Saving…" : dirty ? "Unsaved…" : "Saved"}</Typography>
        )}
        {editable && !autoSave && (
          <Button size="small" variant="contained" startIcon={<SaveOutlinedIcon sx={{ fontSize: 14 }} />} disabled={!dirty || saving} onClick={onSave}>Save</Button>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <RawEditor content={value} language="yaml" height="100%" readOnly={!editable} onChange={editable ? onChange : undefined} />
      </Box>
      {!!problems?.length && (
        <Box sx={{ flexShrink: 0, maxHeight: 110, overflow: "auto", borderTop: "1px solid", borderColor: "divider", px: 1, py: 0.5 }}>
          {problems.slice(0, 12).map((p, i) => (
            <Typography key={i} variant="caption" sx={{ display: "block", fontFamily: "ui-monospace, monospace", fontSize: 13, color: "error.main" }}>
              {p}
            </Typography>
          ))}
          {problems.length > 12 && (
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 13 }}>
              …and {problems.length - 12} more
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
