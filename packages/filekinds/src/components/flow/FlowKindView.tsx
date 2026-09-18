/**
 * The `.flow` kind's registry renderer: the legacy `FlowFileView` (Raw / Preview, the parameter
 * explorer, the screen page, the map, the missing-captures list, the dialogs) exactly as the
 * legacy directory page hosted it, under the legacy palette. A host that passes `onChange` gets
 * the authoring surface; one that does not gets the same thing read-only.
 *
 * The "directory agent" the surface reads relative paths against is the flow's FOLDER; the path
 * is the flow itself. Uploads land beside it (see flowHost.ts). A host that wants to know where
 * the reader stands (Flow Studio's Ask panel aims there) passes `onFocus`.
 */
import { Box } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import type { ViewerProps } from "../../lib/filePreviews";
import FlowFileView from "./FlowFileView";
import type { FlowFocus } from "./FlowPreview";
import { legacyTheme } from "./flowHost";

export type { FlowFocus };

export default function FlowKindView({ content, height = "100%", agentId, path, onChange, editable, chromeless, onFocus, previewOnly }: ViewerProps & {
  onFocus?: (focus: FlowFocus) => void;
  /** The preview alone — no Raw/Preview toggle, no Schema button. A chromeless host gets this by default. */
  previewOnly?: boolean;
}) {
  const docPath = path ?? agentId ?? "";
  const folder = docPath.slice(0, docPath.lastIndexOf("/")) || "/";
  const canEdit = !!onChange && editable !== false;
  return (
    <ThemeProvider theme={legacyTheme}>
      <Box sx={{ height, minHeight: 0, boxSizing: "border-box", bgcolor: "background.default", color: "text.primary", p: 1, overflow: "hidden" }}>
        <FlowFileView
          agentId={docPath ? folder : undefined}
          path={docPath || undefined}
          content={content}
          savedContent={content}
          onContentChange={(next) => onChange?.(next)}
          onSave={() => {}}
          saving={false}
          autoSave
          editable={canEdit}
          height="100%"
          onFocus={onFocus}
          previewOnly={previewOnly ?? !!chromeless}
        />
      </Box>
    </ThemeProvider>
  );
}
