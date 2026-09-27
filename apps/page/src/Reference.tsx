/**
 * The references, each in a dialog over the page:
 *   "How .<ext> works"  walks the kind's book — kinds/<ext>/v<N>.playbook, rendered by the Studio's own walk
 *   "Schema"            the field table — every field, its type, whether it is required, what it is
 *   "Skill"             the studio-files skill — skills/studio-files/SKILL.md, rendered; Copy takes the
 *                       whole file (front matter included) to paste into Settings › Skills or a skills folder
 */
import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogTitle, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { MarkdownPane } from "filekinds";
import Preview from "./Preview";
import { book, fields } from "./kindReference";
import { SKILL, SKILL_PATH, SKILL_RELEASES } from "./skill";

export type ReferenceKind = "book" | "schema" | "skill";

const mono = { fontSize: 12, color: "text.disabled", fontFamily: "ui-monospace, monospace" } as const;
const fill = { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } as const;

export default function Reference({ kind, open, onClose }: { kind: string; open: ReferenceKind | null; onClose: () => void }) {
  const theBook = open === "book" ? book(kind) : null;
  const theFields = open === "schema" ? fields(kind) : null;
  const title = open === "book" ? `How .${kind} works` : open === "schema" ? `.${kind} — the schema` : `The ${SKILL.name || "studio-files"} skill`;
  const where = open === "book" ? theBook?.path : open === "schema" ? theFields?.path : open === "skill" ? SKILL_PATH : undefined;

  // "Copied" shows for a moment after the skill is copied; nothing else is remembered.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => navigator.clipboard?.writeText(SKILL.text).then(() => setCopied(true));
  const download = () => {
    const url = URL.createObjectURL(new Blob([SKILL.text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "SKILL.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open !== null} onClose={onClose} fullWidth maxWidth="lg"
            slotProps={{ paper: { sx: { height: "88vh", display: "flex", flexDirection: "column" } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1, pr: 1, flexWrap: "wrap" }}>
        <span>{title}</span>
        {where && <Typography component="span" sx={mono}>{where}</Typography>}
        <span style={{ flex: 1 }} />
        {open === "skill" && (
          <>
            <Button size="small" variant="outlined" onClick={copy}>{copied ? "Copied" : "Copy SKILL.md"}</Button>
            <Button size="small" variant="outlined" onClick={download}>Download</Button>
            <Button size="small" component="a" href={SKILL_RELEASES} target="_blank" rel="noreferrer">The zip, in the release</Button>
          </>
        )}
        <IconButton size="small" onClick={onClose} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, ...fill }}>
        {open === "book" && (theBook
          ? <div style={fill}><Preview name={`${kind}-v${theBook.version}.playbook`} text={theBook.text} /></div>
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
        {open === "skill" && (
          <div style={fill}>
            <div className="skill-head">
              <div className="muted">
                A skill is the guide as a file Claude.ai chat, Cowork and Claude Code read on their own. Copy it and paste it under
                Settings › Skills, or save it as <code>~/.claude/skills/studio-files/SKILL.md</code>; the release ships the same file zipped.
              </div>
              {SKILL.description && <div className="skill-desc"><b>{SKILL.name}</b> — {SKILL.description}</div>}
            </div>
            <div style={{ ...fill, overflow: "auto" }}><MarkdownPane content={SKILL.body} height="100%" /></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
