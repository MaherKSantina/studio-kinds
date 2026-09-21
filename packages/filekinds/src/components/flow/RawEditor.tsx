/** The raw text pane of a `.flow`: a plain monospace text area. The host — VS Code, the desktop
 *  app — is the text editor; this pane edits the two halves in place with nothing loaded from
 *  anywhere. */
import Box from "@mui/material/Box";

type Height = number | string;

export function RawEditor({
  content, height = 320, readOnly = false, onChange,
}: {
  content: string;
  /** Kept for the callers' sake; the pane is plain text whatever the language. */
  language?: string;
  height?: Height;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <Box sx={{ height, border: "1px solid", borderColor: "divider", borderRadius: 0.5, overflow: "hidden", bgcolor: "background.paper" }}>
      <Box
        component="textarea"
        className="nokey"
        value={content}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value)}
        sx={{
          display: "block", width: "100%", height: "100%", m: 0, p: 1, border: 0, outline: "none", resize: "none",
          bgcolor: "transparent", color: "text.primary",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12, lineHeight: 1.5,
          whiteSpace: "pre-wrap", overflowWrap: "anywhere", tabSize: 2,
        }}
      />
    </Box>
  );
}
