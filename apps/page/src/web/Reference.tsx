/**
 * A kind's reference, in a dialog over the page: "How .<ext> works" walks the kind's book;
 * "Schema" is the field table — every field, its type, whether it is required, what it is.
 */
import { Dialog, DialogContent, DialogTitle, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import Preview from "./Preview";
import { book, fields } from "./kindReference";

export type ReferenceKind = "book" | "schema";

export default function Reference({ kind, open, onClose }: { kind: string; open: ReferenceKind | null; onClose: () => void }) {
  const theBook = open === "book" ? book(kind) : null;
  const theFields = open === "schema" ? fields(kind) : null;
  const title = open === "book" ? `How .${kind} works` : `.${kind} — the schema`;
  const where = open === "book" ? theBook?.path : theFields?.path;
  return (
    <Dialog open={open !== null} onClose={onClose} fullWidth maxWidth="lg"
            slotProps={{ paper: { sx: { height: "88vh", display: "flex", flexDirection: "column" } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1, pr: 1 }}>
        <span>{title}</span>
        {where && <Typography component="span" sx={{ fontSize: 12, color: "text.disabled", fontFamily: "ui-monospace, monospace" }}>{where}</Typography>}
        <span style={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {open === "book" && (theBook
          ? <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}><Preview name={`${kind}-v${theBook.version}.playbook`} text={theBook.text} /></div>
          : <Typography sx={{ p: 2 }}>No book yet for .{kind}.</Typography>)}
        {open === "schema" && (theFields
          ? (
            <Table size="small" stickyHeader className="schema" sx={{ "& td, & th": { verticalAlign: "top" } }}>
              <TableHead>
                <TableRow>
                  <TableCell>field</TableCell>
                  <TableCell>type</TableCell>
                  <TableCell>required</TableCell>
                  <TableCell>description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {theFields.fields.map((f) => (
                  <TableRow key={f.field}>
                    <TableCell sx={{ fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>{f.field}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{f.type ?? ""}</TableCell>
                    <TableCell>{f.required ? "yes" : ""}</TableCell>
                    <TableCell>{f.description ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
          : <Typography sx={{ p: 2 }}>No field table yet for .{kind}.</Typography>)}
      </DialogContent>
    </Dialog>
  );
}
