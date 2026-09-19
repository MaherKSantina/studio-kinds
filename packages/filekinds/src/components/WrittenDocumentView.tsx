/**
 * A document written inside another, rendered by its kind.
 *
 * The registry picks the viewer from the synthetic path a written document
 * carries (`inline.playbook`), the text IS the document (`docText`), and
 * nothing is read — so it renders in a host that has no directory at all.
 * A kind that reads top to bottom (markdown, a brief, a guide) takes its
 * natural height and flows with the prose around it; a surface — a walk, a
 * board, a table, a piano roll — gets a box of its own to lay out and scroll
 * in, the way it would fill a pane.
 */
import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { previewForPath, type ViewerProps } from "../lib/filePreviews";
import { docText, writtenPath, type WrittenDocument } from "../lib/writtenDocument";

/** Kinds that read top to bottom and take their natural height. Every other kind is a surface. */
const FLOWING = new Set(["md", "markdown", "mdx", "brief", "guide"]);

/** The height a surface gets: room for a walk's rail and pane, or a board's columns. */
export const SURFACE_HEIGHT = 480;

export default function WrittenDocumentView({ content, agentId, onDrill, onOpenPath }: {
  content: WrittenDocument;
} & Pick<ViewerProps, "agentId" | "onDrill" | "onOpenPath">) {
  const path = writtenPath(content.kind);
  const kind = useMemo(() => previewForPath(path), [path]);
  const text = useMemo(() => docText(content.doc), [content.doc]);
  if (!kind) {
    return (
      <Typography sx={{ fontSize: 13, color: "#a16207" }}>
        {content.kind ? `.${content.kind} is not a kind the Studio knows` : "This content names no kind — write `kind` beside `doc`"}
      </Typography>
    );
  }
  const flowing = FLOWING.has(content.kind);
  return (
    <Box sx={flowing
      ? { minWidth: 0 }
      : { height: SURFACE_HEIGHT, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
      <kind.Renderer content={text} height={flowing ? "auto" : "100%"} agentId={agentId} path={path}
                     onDrill={onDrill} onOpenPath={onOpenPath} chromeless />
    </Box>
  );
}
