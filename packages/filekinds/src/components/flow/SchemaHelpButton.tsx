/**
 * A small "Schema" button that opens a dialog showing a copyable YAML template (the "schema
 * shape") for a structured file type. Read-only text — the user copies it and pastes into their
 * own file.
 */
import { useState } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tooltip, Typography,
} from "@mui/material";
import DataObjectIcon from "@mui/icons-material/DataObject";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";

export default function SchemaHelpButton({
  template,
  label = "Schema",
  typeLabel,
}: {
  /** The copyable template body shown in the dialog. */
  template: string;
  /** Button label. */
  label?: string;
  /** Friendly type name for the dialog title (e.g. "Matrix"). */
  typeLabel?: string;
  /** Kept for the callers' sake; the template shows as plain text whatever the language. */
  language?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context) — the user can
      // still select the text manually.
    }
  };

  return (
    <>
      <Tooltip title="Show the schema shape for this file type — copy it as a starting point">
        <Button
          size="small"
          variant="outlined"
          startIcon={<DataObjectIcon sx={{ fontSize: "14px !important" }} />}
          onClick={() => setOpen(true)}
          sx={{ textTransform: "none", fontSize: 12, py: 0.25 }}
        >
          {label}
        </Button>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1, minWidth: 0 }}>
            {typeLabel ? `${typeLabel} schema shape` : "Schema shape"}
          </Typography>
          <Button
            size="small"
            startIcon={copied ? <CheckIcon sx={{ fontSize: "14px !important" }} /> : <ContentCopyIcon sx={{ fontSize: "14px !important" }} />}
            onClick={copy}
            sx={{ textTransform: "none" }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box
            component="pre"
            sx={{ m: 0, p: 1.5, height: 440, overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {template}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} sx={{ textTransform: "none" }}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
