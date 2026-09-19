/**
 * Read-only `.brief` viewer — a hierarchical section tree.
 *
 * Wide containers: tree on the left, the selected section's description,
 * prose and — when the section holds a document of another kind — that
 * document, rendered by its own viewer, on the right — standalone AND inside
 * a PaneTrail alike.
 *
 * Narrow containers: the tree fills the width and a section's content opens
 * as the next step — through the enclosing trail (`onDrill`) when the host
 * drills, else in place behind a back chip. The chevron is its own target
 * and only ever expands/collapses; opening content is the label's job.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { parseBrief } from "../../lib/briefDoc";
import type { FeatureNode } from "../../lib/featureTree";
import { MarkdownPane } from "../../lib/MarkdownPane";
import type { ViewerProps } from "../../lib/filePreviews";
import WrittenDocumentView from "../WrittenDocumentView";

const CHANGE_FG: Record<string, string> = { add: "#15803d", edit: "#b45309", remove: "#dc2626" };

/** The split needs room for both panes, so the mode follows the component's
 *  own width — a narrow trail pane on a big monitor is still narrow. Half a
 *  desktop trail region (~512px) must still split; phones must not. */
const SPLIT_MIN_WIDTH = 480;

function NodeRow({ node, path, depth, selected, onSelect, openSet, toggle }: {
  node: FeatureNode;
  path: string;
  depth: number;
  selected: string;
  onSelect: (p: string) => void;
  openSet: Set<string>;
  toggle: (p: string) => void;
}) {
  const kids = node.children ?? [];
  const open = openSet.has(path);
  return (
    <>
      <Stack direction="row" onClick={() => onSelect(path)}
        sx={{ alignItems: "center", gap: 0.5, pl: 1 + depth * 1.5, pr: 1, py: 0.45, cursor: "pointer",
              bgcolor: selected === path ? "#0f172a14" : "transparent",
              "&:hover": { bgcolor: "#0f172a0a" } }}>
        {kids.length
          ? (
            <Box onClick={(e) => { e.stopPropagation(); toggle(path); }}
              sx={{ display: "flex", alignItems: "center", p: 0.5, m: -0.5, borderRadius: 0.5,
                    "&:hover": { bgcolor: "#0f172a14" } }}>
              {open ? <KeyboardArrowDownIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                    : <KeyboardArrowRightIcon sx={{ fontSize: 14, color: "text.disabled" }} />}
            </Box>
          )
          : <Box sx={{ width: 14 }} />}
        <Typography noWrap sx={{ fontSize: 12.5, flex: 1, color: "text.primary" }}>
          {node.name || "Untitled"}
        </Typography>
        {node.change && (
          <Chip size="small" label={node.change}
            sx={{ height: 20, fontSize: 12, bgcolor: `${CHANGE_FG[node.change]}1a`, color: CHANGE_FG[node.change] }} />
        )}
      </Stack>
      {open && kids.map((c, i) => (
        <NodeRow key={i} node={c} path={`${path}.${i}`} depth={depth + 1}
          selected={selected} onSelect={onSelect} openSet={openSet} toggle={toggle} />
      ))}
    </>
  );
}

const nodeAt = (roots: FeatureNode[], path: string): FeatureNode | null => {
  let list = roots;
  let node: FeatureNode | null = null;
  for (const seg of path.split(".")) {
    node = list[Number(seg)] ?? null;
    if (!node) return null;
    list = node.children ?? [];
  }
  return node;
};

/** What a section shows: its description, its prose, and the document written in it, rendered by
 *  its kind. A section with a document and no prose shows the document alone — no placeholder. */
type SectionHost = Pick<ViewerProps, "agentId" | "onDrill" | "onOpenPath">;
const sectionBody = (node: FeatureNode, host: SectionHost) => (
  <>
    {node.description && (
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>{node.description}</Typography>
    )}
    {node.prose
      ? <Box sx={{ "& .md-body": { px: 0, py: 1 } }}><MarkdownPane content={node.prose} height="auto" /></Box>
      : !node.content && <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 1.5 }}>No prose on this section.</Typography>}
    {node.content && (
      <Box sx={{ mt: node.prose ? 0.5 : 1.25 }}>
        <WrittenDocumentView content={node.content} agentId={host.agentId} onDrill={host.onDrill} onOpenPath={host.onOpenPath} />
      </Box>
    )}
  </>
);

/** A section has something to open when it has prose, a description, or a document written in. */
const hasContent = (node: FeatureNode): boolean => !!(node.prose || node.description || node.content);

export default function BriefViewer({ content, height = "100%", onDrill, agentId, onOpenPath }: ViewerProps) {
  const host: SectionHost = { agentId, onDrill, onOpenPath };
  const doc = useMemo(() => parseBrief(content), [content]);
  const [selected, setSelected] = useState("0");
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(doc.sections.map((_, i) => String(i))));
  const toggle = (p: string) =>
    setOpenSet((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.innerWidth >= SPLIT_MIN_WIDTH);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setWide(el.clientWidth >= SPLIT_MIN_WIDTH);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Narrow, no trail to drill into: the detail replaces the tree, back chip
   * returns — the same movement ShelfPane gives a lone document. */
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => { if (wide) setDetail(null); }, [wide]);
  useEffect(() => { setDetail(null); }, [content]);

  const sel = nodeAt(doc.sections, selected) ?? doc.sections[0] ?? null;
  const detailNode = detail ? nodeAt(doc.sections, detail) : null;

  const header = (
    <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{doc.title || "Untitled brief"}</Typography>
    </Box>
  );

  const tree = (onSelect: (p: string) => void) => (
    <>
      {doc.sections.length === 0 && (
        <Typography sx={{ p: 1.5, fontSize: 12, color: "text.disabled" }}>No sections yet</Typography>
      )}
      {doc.sections.map((n, i) => (
        <NodeRow key={i} node={n} path={String(i)} depth={0}
          selected={selected} onSelect={onSelect} openSet={openSet} toggle={toggle} />
      ))}
    </>
  );

  const narrowSelect = (p: string) => {
    setSelected(p);
    const node = nodeAt(doc.sections, p);
    if (!node || !hasContent(node)) return;
    if (onDrill) {
      onDrill({
        key: `section:${p}`,
        title: node.name || "Untitled",
        render: () => <Box sx={{ px: 2, py: 1 }}>{sectionBody(node, host)}</Box>,
      });
    } else {
      setDetail(p);
    }
  };

  return (
    <Box ref={rootRef} sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {header}
      {wide ? (
        /* ── Wide: tree + detail side by side ── */
        <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
          <Box sx={{ width: "38%", minWidth: 180, maxWidth: 250, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", overflowY: "auto", py: 0.5 }}>
            {tree(setSelected)}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
            {sel ? (
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 650 }}>{sel.name || "Untitled"}</Typography>
                {sectionBody(sel, host)}
              </Box>
            ) : (
              <Typography sx={{ p: 2, fontSize: 12, color: "text.disabled" }}>Select a section</Typography>
            )}
          </Box>
        </Box>
      ) : detailNode ? (
        /* ── Narrow, standalone: the detail in place, back chip returns ── */
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Stack direction="row" spacing={0.75}
                 sx={{ alignItems: "center", px: 1, py: 0.5, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
            <Chip size="small" label="‹ back" onClick={() => setDetail(null)}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        bgcolor: "transparent", border: "1px solid", borderColor: "#c3c9d2",
                        "&:hover": { bgcolor: "#0f172a0a" } }} />
            <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{detailNode.name || "Untitled"}</Typography>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2, py: 1 }}>{sectionBody(detailNode, host)}</Box>
        </Box>
      ) : (
        /* ── Narrow: the tree full width; labels open content, chevrons only fold ── */
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", py: 0.5 }}>
          {tree(narrowSelect)}
        </Box>
      )}
    </Box>
  );
}
