/** The legacy app's raw text pane: a Monaco editor, dark, YAML — as `ContentView.RawEditor` was. */
import Box from "@mui/material/Box";
import { Editor } from "@monaco-editor/react";

type Height = number | string;

export function RawEditor({
  content, language, height = 320, readOnly = false, onChange,
}: {
  content: string;
  language: string;
  height?: Height;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <Box sx={{ height, border: "1px solid", borderColor: "divider", borderRadius: 0.5, overflow: "hidden" }}>
      <Editor
        className="nokey"
        height="100%"
        language={language}
        value={content}
        theme="light"
        onChange={(v) => onChange?.(v ?? "")}
        options={{
          readOnly,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          wordWrap: "on",
          automaticLayout: true,
        }}
      />
    </Box>
  );
}
